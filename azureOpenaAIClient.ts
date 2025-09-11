import { AzureOpenAI } from 'openai';
import {
  ChainedTokenCredential,
  AzureCliCredential,
  ManagedIdentityCredential,
  getBearerTokenProvider,
  InteractiveBrowserCredential,
  TokenCredential
} from '@azure/identity';
import dotenv from 'dotenv';

dotenv.config();

// Types
export interface BuildClientOptions {
  apiVersion?: string | undefined;
  authScope?: string | undefined;
  endpoint?: string | undefined;
  credentials?: TokenCredential[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | string;
  content: string;
}

export interface AzureOAIModelParams {
  [k: string]: unknown;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

function getBrowserCredentials(): TokenCredential[] {
  return [new InteractiveBrowserCredential({})];
}

function getNodeCredentials(): TokenCredential[] {
  return [new AzureCliCredential(), new ManagedIdentityCredential()];
}

function getCredentials(): TokenCredential[] {
  return typeof window !== 'undefined' ? getBrowserCredentials() : getNodeCredentials();
}

/**
 * Gets client configured for Azure OpenAI using Azure AD auth.
 */
export async function buildClient({
  apiVersion = process.env.API_VERSION,
  authScope = process.env.AUTH_SCOPE,
  endpoint = process.env.API_ENDPOINT,
  credentials = getCredentials()
}: BuildClientOptions = {}): Promise<AzureOpenAI> {
  if (!endpoint) throw new Error('API_ENDPOINT env var not set');
  if (!authScope) throw new Error('AUTH_SCOPE env var not set');
  const credentialProvider = getBearerTokenProvider(
    new ChainedTokenCredential(...credentials),
    authScope
  );
  return new AzureOpenAI({
    endpoint,
    azureADTokenProvider: credentialProvider,
    apiVersion
  });
}

let clientPromise: Promise<AzureOpenAI> | null = null;

export function getClient(): Promise<AzureOpenAI> {
  if (!clientPromise) {
    clientPromise = buildClient().catch(err => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export async function refreshClient(): Promise<AzureOpenAI> {
  clientPromise = buildClient();
  return clientPromise;
}

/**
 * Invoke Azure OpenAI chat completion with JSON schema enforced response.
 */
export async function azureOAI(
  chatInput: string | ChatMessage[],
  jsonSchema: any,
  modelParameters: AzureOAIModelParams = {}
): Promise<string> {
  const client = await getClient();
  const deploymentName = process.env.DEPLOYMENT_NAME || 'gpt-4.1-mini_2025-04-14';

  const messages: ChatMessage[] = typeof chatInput === 'string'
    ? [{ role: 'user', content: chatInput }]
    : chatInput;

  const response = await (client as any).chat.completions.create({
    model: deploymentName,
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'jsonOutput',
        schema: jsonSchema
      }
    },
    ...modelParameters
  });

  return response?.choices?.[0]?.message?.content || '';
}

export default azureOAI;