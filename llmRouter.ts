import { azureOAI } from './azureOpenaAIClient';
import { ollamaLLM } from './ollamaClient';

/**
 * Unified LLM client selector.
 * Choose provider via env var: LLM_PROVIDER=azure | ollama (default: azure)
 * Optionally override per-call by passing { provider: 'azure' | 'ollama' } in the options object.
 */
export type SupportedProvider = 'azure' | 'ollama';

export interface LLMInvokeOptions {
  provider?: SupportedProvider; // override global choice
  modelParameters?: Record<string, any>; // forwarded to underlying client
  failover?: boolean; // if true, attempt the other provider on failure
}

export type LLMClientFn = (
  prompt: string,
  jsonSchema: any,
  options?: LLMInvokeOptions,
) => Promise<string>;

const envProvider = (process.env.LLM_PROVIDER || 'azure').toLowerCase() as SupportedProvider;

async function callProvider(
  provider: SupportedProvider,
  prompt: string,
  jsonSchema: any,
  modelParameters?: Record<string, any>,
): Promise<string> {
  if (provider === 'ollama') {
    return ollamaLLM(prompt, jsonSchema, modelParameters);
  }
  return azureOAI(prompt, jsonSchema, modelParameters);
}

export const LLMClient: LLMClientFn = async (prompt, jsonSchema, options = {}) => {
  const provider: SupportedProvider = options.provider || envProvider;
  const { modelParameters, failover } = options;

  try {
    const result = await callProvider(provider, prompt, jsonSchema, modelParameters);
    if (!result && failover) {
      const other: SupportedProvider = provider === 'azure' ? 'ollama' : 'azure';
      return callProvider(other, prompt, jsonSchema, modelParameters);
    }
    return result;
  } catch (err) {
    if (failover) {
      const other: SupportedProvider = provider === 'azure' ? 'ollama' : 'azure';
      try {
        return await callProvider(other, prompt, jsonSchema, modelParameters);
      } catch (e) {
        console.error('Failover provider also failed:', (e as any)?.message || e);
        throw e;
      }
    }
    throw err;
  }
};

export default LLMClient;
