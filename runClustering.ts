import path from 'path';
import { LLMClient } from './llmRouter';
import {
  getParquetFiles,
  splitIntoBatches,
  shuffleInPlace,
  truncateWithTiktoken,
  writeJSONLStream,
  normalizeConversation,
  safeJSONParse,
  extractClusters,
} from './utils';
import { Semaphore } from './semaphore';
import {
  generateInitialClustersPrompt,
  generateSummarizationPrompt,
  generateClusterUpdatePrompt,
  generateReviewPrompt,
  summaryJsonSchema,
  InitialClusterListSchema,
  UpdatedClusterListSchema,
} from './clusterPrompts';
import { ChatRecord, ClusterTable } from './types';

/* ========================
  Prompt Config
======================== */

const USE_CASE =
  'Primary area of interest. This will include the main topic of the conversation or any other specific subject that the user is interested in discussing or learning about.';
const MAX_CLUSTERS = 5; // Max number of cluster labels for taxonomy
const SUMMARY_LENGTH = 50; // Target summary length for chat message
const CLUSTER_NAME_LENGTH = 3; // Max word count for cluster label title
const SUGGESTION_LIMIT = 20; // Word count limit for cluster table suggestions 

/* ========================
  Config
======================== */

const SUMMARIZE_DATA = false; // Should summarize chat messages for LLM input
const TRUNCATE_DATA = true; // Should truncate chat messages for LLM input, this is a less costly approach than summarization
const DATA_LIMIT = 100; // Max number of data rows to use from parquet file
const NUMBER_OF_BATCHES = 20; // total number of batches (size of batch will be DATA_LIMIT/ NUMBER_OF_BATCHES)
const SUMMARY_CONCURRENCY = parseInt(process.env.SUMMARY_CONCURRENCY || '4', 10);

/* ========================
  Main
======================== */

async function main(): Promise<void> {
  // Step 1: Load chat data
  const parquetData: ChatRecord[] = await getParquetFiles(DATA_LIMIT);
  if (!parquetData.length) {
    console.error('No data loaded from parquet files.');
  }
  console.log('Parquet data loaded:', parquetData.length, 'rows');

  let dataToProcess: ChatRecord[] = parquetData;

  // Step 2: reduce chat size with either token truncation or summarization
  // Optional truncation
  if (TRUNCATE_DATA) {
    console.log('Truncating each conversation to max token limit');
    dataToProcess = parquetData.map((chat) => {
      const conversationText = normalizeConversation(chat);
      const truncated = truncateWithTiktoken(conversationText, 250);
      return { ...chat, summary: truncated };
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Optional summarization
  if (SUMMARIZE_DATA) {
    console.log('Starting Summarization task');
    const semaphore = new Semaphore(SUMMARY_CONCURRENCY);
    const summarized = await Promise.all(
      dataToProcess.map((chat) =>
        semaphore.use(async () => {
          // uses 
          const messageText = normalizeConversation(chat);// uses chat.context to concat message, if this key is not in your dataset, alter this function
          const prompt = generateSummarizationPrompt(messageText, USE_CASE, SUMMARY_LENGTH);
          const summaryRaw = await LLMClient(prompt, summaryJsonSchema, { failover: true });
          const parsed = safeJSONParse<{ summary?: string }>(summaryRaw);
          const summaryOut = parsed.ok && parsed.value.summary ? parsed.value.summary : summaryRaw;
          const updated: ChatRecord = { ...chat, summary: summaryOut };
          return updated;
        }),
      ),
    );

    const summaryOutputPath = path.join(process.cwd(), 'outputs', `summaries_${timestamp}.jsonl`);
    console.log(`Summarization completed. Summary output writing to ${summaryOutputPath}`);
    // write out summaries so can reference later
    writeJSONLStream(summarized, summaryOutputPath);
    dataToProcess = summarized;
  }

  // Shuffle + batch data
  const batched = splitIntoBatches(shuffleInPlace([...dataToProcess]), NUMBER_OF_BATCHES);
  if (!batched.length) {
    console.error('No batches produced.');
    return;
  }

  // Step 3: Generate initial seed cluster list based on initial clusters
  const initialBatch = batched[0];
  const taxonomyPrompt = generateInitialClustersPrompt(
    initialBatch,
    USE_CASE,
    MAX_CLUSTERS,
    CLUSTER_NAME_LENGTH,
  );

  const initialResponse = await LLMClient(taxonomyPrompt, InitialClusterListSchema, {
    failover: true,
  });

  let updatedClusterList: ClusterTable | null = null;

  const parsed = safeJSONParse<ClusterTable>(initialResponse);
  if (parsed.ok) {
    updatedClusterList = parsed.value;
  } else {
    console.error(`Failed to parse initial cluster JSON: ${parsed.error.message}`);
  }
  console.log(`Generated seed clusters: ${JSON.stringify(updatedClusterList)}`);

  // Step 4: Iteratively update cluster list with each batch
  console.log('Starting batch iterations');
  for (const batch of batched.slice(1)) {
    if (!updatedClusterList) {
      console.error('No clusters available for assignment.');
      break;
    }

    const updatePrompt = generateClusterUpdatePrompt(
      updatedClusterList,
      batch,
      MAX_CLUSTERS,
      USE_CASE,
      CLUSTER_NAME_LENGTH,
      SUGGESTION_LIMIT,
    );
    const updateResponse = await LLMClient(updatePrompt, UpdatedClusterListSchema, {
      failover: true,
    });

    const parsed = safeJSONParse<ClusterTable>(updateResponse);
    if (parsed.ok) {
      updatedClusterList = parsed.value;
    } else {
      console.error(`Failed to parse initial cluster JSON: ${parsed.error.message}`);
    }
    console.log(`Updated cluster list: ${JSON.stringify(updatedClusterList)}`);
  }

  console.log('Final clusters before review:', updatedClusterList);

  // Step 5: LLM review final taxonomy
  if (!updatedClusterList) {
    console.error('Error: Cant process final clusters. No clusters to review.');
    return;
  }
  const reviewPrompt = generateReviewPrompt(
    updatedClusterList,
    MAX_CLUSTERS,
    USE_CASE,
    CLUSTER_NAME_LENGTH,
    SUGGESTION_LIMIT,
  );
  const reviewResponse = await LLMClient(reviewPrompt, UpdatedClusterListSchema, {
    failover: true,
  });

  let finalClusterList: ClusterTable = updatedClusterList || {};
  const reviewParsed = safeJSONParse<ClusterTable>(reviewResponse);
  if (reviewParsed.ok) {
    finalClusterList = reviewParsed.value;
  } else {
    console.error(`Failed to parse reviewed cluster JSON: ${reviewParsed.error.message}`);
  }

  console.log('Final reviewed clusters:', finalClusterList);

  const finalEntries = extractClusters(finalClusterList);
  if (finalEntries && finalEntries.length > 0) {
    const finalOutputsPath = path.join(
      process.cwd(),
      'outputs',
      `finalClusterList_${timestamp}.jsonl`,
    );
    // write final outputs to /outputs dir
    console.log(`writing final outputs to: ${finalOutputsPath}`);
    writeJSONLStream(finalEntries, finalOutputsPath);
  } else {
    console.error('No final cluster entries to write.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
