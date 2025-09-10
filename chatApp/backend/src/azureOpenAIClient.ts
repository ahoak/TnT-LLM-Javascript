import { AzureOpenAI } from "openai";
import {
  ChainedTokenCredential,
  AzureCliCredential,
  ManagedIdentityCredential,
  getBearerTokenProvider,
  InteractiveBrowserCredential,
} from "@azure/identity";
import { ChatCompletionMessageParam } from "openai/resources";

import dotenv from 'dotenv';
dotenv.config();

function getBrowserCredentials() {
  return [new InteractiveBrowserCredential({})];
}
function getNodeCredentials() {
  return [ new AzureCliCredential(), new ManagedIdentityCredential() ];
}
function getCredentials() {
  return typeof window !== "undefined" ? getBrowserCredentials() : getNodeCredentials();
}


/**
 * Gets client configured for Azure OpenAI.
 * @param apiVersion The API version to use for the AOAI client.
 * @param authScope The authentication scope for the AOAI client.
 * @param endpoint The endpoint URL for the AOAI instance.
 * @param credentials The credentials to use for authentication.
 * @returns A promise that resolves to an OpenAI client configured for AOAI.
 */
async function buildClient({
  apiVersion = process.env.API_VERSION,
  authScope  = process.env.AUTH_SCOPE,
  endpoint   = process.env.API_ENDPOINT,
  credentials = getCredentials()
} = {}) {
  const credential = getBearerTokenProvider(
    new ChainedTokenCredential(...credentials),
    authScope ?? ""
  );
  return new AzureOpenAI({
    endpoint,
    azureADTokenProvider: credential,
    apiVersion,
  });
}

let clientPromise: Promise<AzureOpenAI> | null = null;
function getClient() {
  if (!clientPromise) {
    clientPromise = buildClient().catch(err => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

async function refreshClient() {
  clientPromise = buildClient();
  return clientPromise;
}

async function azureOAI(
  chatInput: string | ChatCompletionMessageParam[],
  jsonSchema: any | null = null,
  modelParameters: Record<string, any> = {}
) {
  const client = await getClient();
  const deploymentName = process.env.DEPLOYMENT_NAME || "gpt-4.1-mini_2025-04-14";

  const messages: ChatCompletionMessageParam[] = typeof chatInput === "string"
    ? [{ role: "user", content: chatInput } as ChatCompletionMessageParam]
    : chatInput as ChatCompletionMessageParam[];
    if (jsonSchema){
        modelParameters['response_format'] = {
            type: "json_schema",
            json_schema: {
                name: "jsonOutput",
                schema: jsonSchema
            },
        };

    }

    try {
        const response = await client.chat.completions.create({
            model: deploymentName,
            messages,
            ...modelParameters,
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("Error in azureOAI:", error);
        throw error;
    }
}

export { azureOAI, refreshClient, getClient };