import { azureOAI, azureOAIStream } from './azureOpenAIClient.js';
import { ollamaLLM, streamOllama } from './ollamaClient.js';

export type LLMProvider = 'azure' | 'ollama';

export interface LLMRouterOptions {
  provider?: LLMProvider;          // override env default
  failover?: boolean;              // try the other provider on failure/empty
  modelParameters?: Record<string, any>; // forwarded to underlying call
}

const envProvider = (process.env.CHATAPP_LLM_PROVIDER || process.env.LLM_PROVIDER || 'azure')
  .toLowerCase() as LLMProvider;

async function callNonStreaming(
  provider: LLMProvider,
  prompt: string,
  jsonSchema: any,
  modelParameters?: Record<string, any>,
): Promise<string> {
  if (provider === 'ollama') return ollamaLLM(prompt, jsonSchema, modelParameters);
  return azureOAI(prompt, jsonSchema, modelParameters);
}

async function* callStreaming(
  provider: LLMProvider,
  messages: { role: string; content: string }[],
  jsonSchema?: any,
  modelParameters?: Record<string, any>,
): AsyncGenerator<string, void, void> {
  if (provider === 'ollama') {
    for await (const delta of streamOllama(messages, { model: modelParameters?.model, format: jsonSchema, options: modelParameters })) {
      yield delta;
    }
    return;
  }
  for await (const delta of azureOAIStream(messages, jsonSchema, modelParameters)) {
    yield delta;
  }
}

export async function LLMInvoke(
  prompt: string,
  jsonSchema: any,
  options: LLMRouterOptions = {},
): Promise<string> {
  const primary = options.provider || envProvider;
  try {
    const out = await callNonStreaming(primary, prompt, jsonSchema, options.modelParameters);
    if (!out && options.failover) {
      const secondary: LLMProvider = primary === 'azure' ? 'ollama' : 'azure';
      return callNonStreaming(secondary, prompt, jsonSchema, options.modelParameters);
    }
    return out;
  } catch (e) {
    if (options.failover) {
      const secondary: LLMProvider = primary === 'azure' ? 'ollama' : 'azure';
      return callNonStreaming(secondary, prompt, jsonSchema, options.modelParameters);
    }
    throw e;
  }
}

export async function* LLMStream(
  messages: { role: string; content: string }[],
  jsonSchema?: any,
  options: LLMRouterOptions = {},
): AsyncGenerator<string, void, void> {
  const primary = options.provider || envProvider;
  try {
    for await (const d of callStreaming(primary, messages, jsonSchema, options.modelParameters)) {
      yield d;
    }
  } catch (e) {
    if (options.failover) {
      const secondary: LLMProvider = primary === 'azure' ? 'ollama' : 'azure';
      for await (const d of callStreaming(secondary, messages, jsonSchema, options.modelParameters)) {
        yield d;
      }
    } else {
      throw e;
    }
  }
}

export default { LLMInvoke, LLMStream };