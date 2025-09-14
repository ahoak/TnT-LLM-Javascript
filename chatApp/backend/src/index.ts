import express, { Request, Response } from 'express';
import cors from 'cors';
import { nanoid } from 'nanoid';
import type { 
  ChatRequest, 
  ChatFullResponse, 
  ChatMessage, 
  ChatResponseChunk, 
  TopicClassificationRequest, 
  ClassificationResponse, 
  NormalizedTourRecord

} from '../../shared/types.js';
import databaseRecords from '../../shared/mockDatabase.json' with { type: 'json' };

import dotenv from 'dotenv';

import { azureOAI, azureOAIStream } from './azureOpenAIClient.js';
import { ollamaLLM } from './ollamaClient.js';
import { generateSystemPrompt, 
  generateClassifyTopicPrompt,
  generateClassifyDestinationRecord 
} from './generatePrompts.js';
import { conversations, destinationRecordSchema, formatRetrievalContext, getOrCreateConversation, MetaDataLabels, metadataLabelsSchema, safeJSONParse } from './utils.js';
dotenv.config();

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());



app.post('/api/chat', async (req: Request, res: Response) => {
  const body: ChatRequest = req.body;
  const { model = 'gemma3:1b', jsonSchema, options } = body;
  const conv = getOrCreateConversation(body.conversationId);
  const lastUserMsg = body.messages?.[body.messages.length - 1];
  if (!lastUserMsg) {
    return res.status(400).json({ error: 'No messages provided' });
  }

  // Append new user message to conversation history firstn
  const userMessage: ChatMessage = {
    id: nanoid(),
    role: 'user',
    content: lastUserMsg.content,
    createdAt: new Date().toISOString()
  };
  conv.messages.push(userMessage);

  const userIntentResponse = await classifyUserIntent(lastUserMsg.content);
  console.log('User Intent Response:', userIntentResponse);
  const retrievalContext = formatRetrievalContext(lastUserMsg.content, databaseRecords);
  console.log('Retrieval Context:', retrievalContext);

  const relatedDocuments = await classifyDesitinationRecord( lastUserMsg.content, retrievalContext);
  console.log('Related Documents:', relatedDocuments);

  const conversations = conv.messages.map(m => ({ role: m.role, content: m.content }))
  const history = [
    { role: 'user', content: generateSystemPrompt(userIntentResponse, relatedDocuments, conversations) },
  ];  
  console.log('Final conversation history for LLM:', history);


  if (body.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);
    req.on('close', () => clearInterval(heartbeat));

    const assistantMessageId = nanoid();
    let assembled = '';

    try {
      for await (const delta of azureOAIStream(history)) {
        assembled += delta;
        const sse: ChatResponseChunk = {
          id: assistantMessageId,
          conversationId: conv.id,
          role: 'assistant',
          delta,
          done: false
        };
        res.write(`data: ${JSON.stringify(sse)}\n\n`);
      }
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ error: e?.message || 'stream error' })}\n\n`);
    }

    const fullMsg: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: assembled || '[empty]',
      createdAt: new Date().toISOString()
    };
    conv.messages.push(fullMsg);


    const doneEvent: ChatResponseChunk = {
      id: assistantMessageId,
      conversationId: conv.id,
      role: 'assistant',
      delta: '',
      done: true
    };
    res.write(`data: ${JSON.stringify(doneEvent)}\n\n`);
    clearInterval(heartbeat);
    res.end();
    return;
  }

  // Non-streaming path-not used
  const llmContent = await ollamaLLM(lastUserMsg.content, jsonSchema, { model, options });
  const assistantMessage: ChatMessage = {
    id: nanoid(),
    role: 'assistant',
    content: llmContent || '[empty response]',
    createdAt: new Date().toISOString()
  };
  conv.messages.push(assistantMessage);

  const response: ChatFullResponse = {
    conversationId: conv.id,
    message: assistantMessage
  };
  res.json(response);
});

async function classifyDesitinationRecord(userMessage: string, retrievalContext: string): Promise<NormalizedTourRecord[]> {
  const prompt = generateClassifyDestinationRecord(userMessage, retrievalContext);
  const raw = await azureOAI(prompt, destinationRecordSchema);
  if (!raw) {
    console.error('LLM returned no response for destination record classification');
    return [];
  }
  console.log("Raw destination record classification response:", raw);

  const parsed = safeJSONParse<{ table: any[] }>(raw);
    if (parsed.ok) {
      console.log('Parsed destination record:', parsed.value);
      return parsed.value.table;
    } else {
      console.error('Failed to parse destination record JSON:', parsed.error.message);
      throw new Error('Failed to parse destination record JSON');
    }
}

async function classifyUserIntent(userMessage: string): Promise<ClassificationResponse | null> {
  
  const prompt = generateClassifyTopicPrompt(userMessage);
  const raw = await azureOAI(prompt, metadataLabelsSchema);

  console.log("Raw topic classification response:", raw);

  const parsed = safeJSONParse<MetaDataLabels>(raw);
  let labels:MetaDataLabels = {}
    if (parsed.ok) {
      labels = parsed.value;
      console.log('Parsed initial clusters.');
    } else {
      console.error('Failed to parse initial cluster JSON:', parsed.error.message);
    }

  return { ...labels, raw };
}



// Classify topic explicitly (alternate endpoint)
app.post('/api/classify-topic', async (req: Request, res: Response) => {
  const body: TopicClassificationRequest = req.body;
  let history: { role: string; content: string }[] = [];
  if (body.conversationId && conversations.has(body.conversationId)) {
    history = conversations.get(body.conversationId)!.messages.map(m => ({ role: m.role, content: m.content }));
  } else if (body.messages?.length) {
    history = body.messages;
  } else {
    return res.status(400).json({ error: 'No conversationId or messages provided' });
  }
  const transcript = history.map(m => (m.role === 'assistant' ? 'AI' : 'User') + ': ' + m.content).join('\n');
  // truncate transcript 250 tokens
  const resp = await classifyUserIntent(transcript);
  res.json(resp);
});

const port = process.env.PORT || 3000;
app.listen(port, async () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
