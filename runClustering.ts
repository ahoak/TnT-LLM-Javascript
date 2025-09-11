import path from 'path';
import { ollamaLLM } from './llmClient';
import { azureOAI } from './azureOpenaAIClient';
import {
  getParquetFiles,
  splitIntoBatches,
  shuffleInPlace,
  truncateWithTiktoken,
  writeJSONLStream,
  normalizeConversation,
  safeJSONParse,
  extractClusters
} from './utils';
import { Semaphore } from './semaphore';
import {
  generateInitialClustersPrompt,
  generateSummarizationPrompt,
  generateClusterUpdatePrompt,
  generateReviewPrompt,
  summaryJsonSchema,
  InitialClusterListSchema,
  UpdatedClusterListSchema
} from './clusterPrompts';
import { ChatRecord, ClusterTable } from './types';



/* ========================
   Config
======================== */

const SUMMARY_CONCURRENCY = parseInt(process.env.SUMMARY_CONCURRENCY || '4', 10);
const USE_CASE =
  'Primary area of interest. This will include the main topic of the conversation or any other specific subject that the user is interested in discussing or learning about.';
const MAX_CLUSTERS = 5;
const SUMMARY_LENGTH = 50;
const CLUSTER_NAME_LENGTH = 3;
const SUGGESTION_LIMIT = 20;

const SUMMARIZE_DATA = false;
const TRUNCATE_DATA = true;
const DATA_LIMIT = 100;
const NUMBER_OF_BATCHES = 20;



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

  // Optional truncation
  if (TRUNCATE_DATA) {
    console.log('Truncating each conversation to max token limit');
    dataToProcess = parquetData.map(chat => {
      const conversationText = normalizeConversation(chat);
      const truncated = truncateWithTiktoken(conversationText, 250);
      return { ...chat, summary: truncated };
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Optional summarization
  if (SUMMARIZE_DATA) {
    const semaphore = new Semaphore(SUMMARY_CONCURRENCY);
    const summarized = await Promise.all(
      dataToProcess.map(chat =>
        semaphore.use(async () => {
          const messageText = normalizeConversation(chat);
            // Fixed argument passing (removed accidental assignments like data=message)
          const prompt = generateSummarizationPrompt(
            messageText,
            USE_CASE,
            SUMMARY_LENGTH,
            ''
          );

          const summaryRaw = await azureOAI(prompt, summaryJsonSchema);
          let summaryOut: string;
          const parsed = safeJSONParse<{ summary?: string }>(summaryRaw);
            // fallback to raw if not JSON or summary missing
          summaryOut = parsed.ok && parsed.value.summary ? parsed.value.summary : summaryRaw;

          const updated: ChatRecord = { ...chat, summary: summaryOut };
          console.log(
            `[summary] done id=${chat.id || chat.conversation_hash || '?'} | in-flight <= ${SUMMARY_CONCURRENCY}`
          );
          return updated;
        })
      )
    );
  writeJSONLStream(summarized, path.join(process.cwd(), 'outputs', `summaries_${timestamp}.jsonl`));
    dataToProcess = summarized;
    console.log('Summarization completed for all data.');
  }

  // Shuffle + batch
  const batched = splitIntoBatches(shuffleInPlace([...dataToProcess]), NUMBER_OF_BATCHES);
  if (!batched.length) {
    console.error('No batches produced.');
    return;
  }

  // Initial clusters
  const initialBatch = batched[0];
  const taxonomyPrompt = generateInitialClustersPrompt(
    initialBatch,
    USE_CASE,
    MAX_CLUSTERS,
    CLUSTER_NAME_LENGTH,
    ''
  );

  const initialResponse = await azureOAI(taxonomyPrompt, InitialClusterListSchema);
  console.log('Initial cluster response:', initialResponse);

  let clusterState: ClusterTable | null = null;
  {
    const parsed = safeJSONParse<ClusterTable>(initialResponse);
    if (parsed.ok) {
      clusterState = parsed.value;
      console.log('Parsed initial clusters.');
    } else {
      console.error('Failed to parse initial cluster JSON:', parsed.error.message);
    }
  }

  // Iteratively update clusters
  for (const batch of batched.slice(1)) {
    if (!clusterState) {
      console.error('No clusters available for assignment.');
      break;
    }

    const updatePrompt = generateClusterUpdatePrompt(
      clusterState,
      batch,
      MAX_CLUSTERS,
      USE_CASE,
      CLUSTER_NAME_LENGTH,
      SUGGESTION_LIMIT,
      ''
    );
    const updateResponse = await azureOAI(updatePrompt, UpdatedClusterListSchema);
    console.log('Assignment response:', updateResponse);

    const parsed = safeJSONParse<ClusterTable>(updateResponse);
    if (parsed.ok) {
      clusterState = parsed.value;
    } else {
      console.error('Failed to parse cluster JSON:', parsed.error.message);
    }
  }

  console.log('Final clusters before review:', clusterState);

  // Review taxonomy

  if (!clusterState) {
    console.error('Error: Cant process final clusters. No clusters to review.');
    return;
  }
  const reviewPrompt = generateReviewPrompt(
    clusterState,
    MAX_CLUSTERS,
    USE_CASE,
    CLUSTER_NAME_LENGTH,
    SUGGESTION_LIMIT,
    ''
  );
  const reviewResponse = await azureOAI(reviewPrompt, UpdatedClusterListSchema);

  let finalClusterList: ClusterTable = clusterState || {};
  const reviewParsed = safeJSONParse<ClusterTable>(reviewResponse);
  if (reviewParsed.ok) {
    finalClusterList = reviewParsed.value;
  } else {
    console.error('Failed to parse reviewed cluster JSON:', reviewParsed.error.message);
  }

  console.log('Final reviewed clusters:', finalClusterList);

  const finalEntries = extractClusters(finalClusterList);
  if (finalEntries) {
    writeJSONLStream(
      finalEntries,
      path.join(process.cwd(), 'outputs', `finalClusterList_${timestamp}.jsonl`)
    );
  } else {
    console.error('No final cluster entries to write.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});