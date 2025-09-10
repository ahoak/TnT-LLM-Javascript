const { AzureOpenAI } = require("openai");
const {
  ChainedTokenCredential,
  AzureCliCredential,
  ManagedIdentityCredential,
  getBearerTokenProvider,
  InteractiveBrowserCredential,
} = require("@azure/identity");
const dotenv = require('dotenv');
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
    authScope
  );
  return new AzureOpenAI({
    endpoint,
    azureADTokenProvider: credential,
    apiVersion,
  });
}

let clientPromise = null;
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

async function azureOAI(chatInput, jsonSchema, modelParameters = {}) {
  const client = await getClient();
  const deploymentName = process.env.DEPLOYMENT_NAME || "gpt-4.1-mini_2025-04-14";

  const messages = typeof chatInput === "string"
    ? [{ role: "user", content: chatInput }]
    : chatInput;

  const response = await client.chat.completions.create({
    model: deploymentName,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "jsonOutput",
        schema: jsonSchema
      },
    },
    ...modelParameters,
  });
  return response.choices[0].message.content;
}

module.exports = { azureOAI, refreshClient, getClient };