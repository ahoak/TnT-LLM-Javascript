import { Ollama } from 'ollama';

// Allow overriding base URL via env; fallback to localhost.
// Some versions of the ollama JS client auto-detect the local daemon; base URL override
// may not be part of the public type surface. Keep env for future use but don't pass
// unknown property to constructor for type safety.
const BASE_URL_DEFAULT = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim();

const DEFAULT_MODEL = (process.env.OLLAMA_MODEL ||  'gemma3:1b')

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | string;
  content: string;
}

export interface OllamaLLMOptions {
  model?: string;
  messages?: OllamaChatMessage[]; // If provided, overrides single text param usage.
  options?: Record<string, unknown>; // Model-specific tuning parameters
  stream?: boolean; // Force disable/enable streaming (we default to false in this wrapper)
  format?: any; // JSON schema or other
}

// Non-streaming convenience wrapper replicating original behavior.
export async function ollamaLLM(
  text: string,
  jsonSchema: any,
  modelParameters: OllamaLLMOptions = {}
): Promise<string> {
  try {
  // If future versions expose baseUrl/baseURL typing we can conditionally include it.
  const ollama = new Ollama({ host: BASE_URL_DEFAULT });
    const {
      model = DEFAULT_MODEL,
      messages,
      stream, // ignored (forced false)
      ...rest
    } = modelParameters;

  const response = await ollama.chat({
      model,
      messages: messages ?? [{ role: 'user', content: text }],
      format: jsonSchema,
      stream: false,
      ...rest
    } as any);

  const anyResp: any = response as any;
  const output: string = anyResp?.message?.content || '';
  return output;
  } catch (err: any) {
    console.error('Error in LLM call:', err?.message || err);
    return '';
  }
}

export default ollamaLLM;