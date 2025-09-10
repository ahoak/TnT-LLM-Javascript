import express, { Request, Response } from 'express';
import cors from 'cors';
import { nanoid } from 'nanoid';
import type { ChatRequest, ChatFullResponse, ChatMessage, ChatResponseChunk, TopicClassificationRequest, TopicClassificationResponse } from '../../shared/types.js';
import dotenv from 'dotenv';

import ollama from 'ollama';
import { azureOAI } from './azureOpenAIClient.js';
dotenv.config();

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

interface Conversation {
  id: string;
  messages: ChatMessage[];
}
const BASE_URL_DEFAULT = 'http://127.0.0.1:11434'; // Ollama server URL

const conversations = new Map<string, Conversation>();

function classifyTopicPrompt(msgText:string){
    return `
    Given a conversation between user and AI agent, classify the user's primary topic into one of the following labels:

    Technology: Computing, software, hardware, electronics, AI, or technical implementation.
    Lifestyle: Habits, routines, travel, hobbies, home, fashion, food (non-medical), personal organization, daily living.
    Entertainment: Movies, TV, music, games, sports (spectating), celebrities, pop culture, media consumption.
    Science: Physics, biology, chemistry, astronomy, ecology, math (as science), research methods.
    Career: Jobs, hiring, resumes, interviews, workplace dynamics, professional development, networking, entrepreneurship (non-financial structuring).
    History, Event, and Law: Historical topics, past events, civics, government, policy, legal concepts, regulations, courts, geopolitical events.
    Money: Personal finance, investing, budgeting, banking, economics (financial framing), crypto (financial angle), pricing, financial strategy.
    Health: Physical or mental health, medicine, symptoms, fitness, nutrition (health framing), healthcare systems, wellness interventions.
    Language, Writing, and Editing: Grammar, wording, tone, translation, style, copy editing, rhetorical improvement, constructing/refining written content.
    Food: Recipes, cooking techniques, culinary traditions, dietary preferences, food culture, meal planning, nutrition (non-medical).

    If none fit, respond with: Other

    Return ONLY the label string with exact casing.
    Make sure it encompasses what users primary area of interest for the conversation
    ## AI Conversation
    ${msgText}
`
}

const TOPIC_LABELS = [
  'Technology',
  'Lifestyle',
  'Entertainment',
  'Science',
  'Career',
  'History, Event, and Law',
  'Money',
  'Health',
  'Language, Writing, and Editing',
  'Food',
  'Other'
] as const;

function normalizeTopicLabel(raw:string): string {
  const cleaned = raw.trim().split(/\r?\n/)[0].replace(/^[-*\d.)\s]+/, '');
  const exact = TOPIC_LABELS.find(l => l.toLowerCase() === cleaned.toLowerCase());
  return exact || 'Other';
}



// Non-streaming convenience wrapper (unused in SSE path but available for non-stream endpoint)
async function ollamaLLM(text: string, jsonSchema: any, modelParameters: Record<string, unknown> = {}) {
  try {
    const response = await ollama.chat({
      model: 'gemma3:1b',
      messages: [{ role: "system", content: "You are a helpful assistant." },{ role: 'user', content: text }],
      format: jsonSchema,
      stream: false,
  ...modelParameters
    });
    const output = response.message?.content || '';
    return output;
  } catch (err: any) {
    console.error('Error in LLM call:', err?.message || err);
    return '';
  }
}

// Streaming generator yielding incremental deltas for a full message history
async function* streamOllama(
  messages: { role: string; content: string }[],
  opts: { model?: string; format?: any; options?: Record<string, unknown> } = {}
): AsyncGenerator<string, void, void> {
  const { model = 'gemma3:1b', format, options } = opts;
  let previous = '';
  try {
    const stream = await ollama.chat({
      model,
      messages,
      stream: true,
      format,
      ...(options ? { options } : {})
    });
    for await (const chunk of stream as any) {
      const full = chunk?.message?.content || '';
      yield(full)
  
      if (chunk?.done) break;
    }
  } catch (err: any) {
    console.error('Ollama stream error:', err?.message || err);
  }
}


function getOrCreateConversation(id?: string): Conversation {
  if (id && conversations.has(id)) return conversations.get(id)!;
  const newConv: Conversation = { id: id ?? nanoid(), messages: [] };
  conversations.set(newConv.id, newConv);
  return newConv;
}

// NOTE: fakeModelStream removed; using real Ollama streaming via streamOllama

app.post('/api/chat', async (req: Request, res: Response) => {
  const body: ChatRequest = req.body;
  const { model = 'gemma3:1b', jsonSchema, options } = body;
  const conv = getOrCreateConversation(body.conversationId);
  const lastUserMsg = body.messages?.[body.messages.length - 1];
  if (!lastUserMsg) {
    return res.status(400).json({ error: 'No messages provided' });
  }

  // Append new user message to conversation history first
  const userMessage: ChatMessage = {
    id: nanoid(),
    role: 'user',
    content: lastUserMsg.content,
    createdAt: new Date().toISOString()
  };
  conv.messages.push(userMessage);

  // Build full history for provider (only roles/content needed)
  const history = conv.messages.map(m => ({ role: m.role, content: m.content }));


  if (body.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Heartbeat to keep connection alive (every 25s)
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);
    req.on('close', () => clearInterval(heartbeat));

    const assistantMessageId = nanoid();
    let assembled = '';

    try {
      for await (const delta of streamOllama(history, { model, format: jsonSchema, options })) {
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

  // Non-streaming path
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

  const prompt = classifyTopicPrompt(transcript);
  const raw = await azureOAI(prompt);
  if (!raw) {
    return res.status(500).json({ error: 'LLM returned no response' });
  }
  console.log("Raw topic classification response:", raw);

  const label = normalizeTopicLabel(raw || '');
  const resp: TopicClassificationResponse = { label, raw };
  res.json(resp);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
