# TnT-LLM-Javascript

This repository was created in conjunction with the CascadiaJS 2025 conference talk: [_“Unlocking User Insights with LLMs to Design Smarter UI and Flows”_](https://cascadiajs.com/2025/talks/unlocking-user-insights-with-llms-to-design-smarter-ui-and-flows). It serves as a practical companion showing how to create a cluster label taxonomy using Node and demo showcasing how to use this within a user chat app.

## Clustering Pipeline (TnT-LLM Inspired)

This repo includes a lightweight TypeScript implementation of a text clustering workflow inspired by the Microsoft Research paper:

[Text Mining at Scale with Large Language Models TnT-LLM](https://www.microsoft.com/en-us/research/publication/tnt-llm-text-mining-at-scale-with-large-language-models/)

This is implemented in `runClustering.ts` at the project root.

The approach here follows the paper’s core loop:

1. Reduce chat text size through either token truncation or summarization (see generateSummarizationPrompt() in `clusterPrompt.ts`).
2. Generate an initial taxonomy (cluster table) with an LLM (see generateInitialClustersPrompt() in `clusterPrompt.ts`).
3. Iteratively update / refine clusters with additional batches (rating + revision loop) (see generateClusterUpdatePrompt() in `clusterPrompt.ts`).
4. Final review / consolidation pass to produce the final cluster table (see generateReviewPrompt() in `clusterPrompt.ts`).

Outputs are written as JSONL files to `./outputs` in the project root:

- `summaries_*.jsonl` (if summarization enabled)
- `finalClusterList_*.jsonl`

### Data Input

Place Parquet files in `./data/` (project root). Only one sample Parquet file is needed to start; multiple files are concatenated. Adjust limits via environment variables or constants in `runClustering.ts`:

- `DATA_LIMIT` (number of rows to read)
- `NUMBER_OF_BATCHES` (controls total number of batches)
- `MAX_CLUSTERS` (max number of clusters to output)
- `CLUSTER_NAME_LENGTH` (cluster label length)

Quick start dataset:

- WildChat conversations (AllenAI) – you only need a single shard/file sampled (~1000 to 10,000 sample) to validate the pipeline.
- Browse and download an individual file here:
  https://huggingface.co/datasets/allenai/WildChat-1M/tree/main/data

After downloading one `train-00000-of-000xx.parquet` file, place it in `./data/` and run the script.

### Running the Clustering Script

Install dependencies (once):

```bash
npm install
```

Run the clustering pipeline:

```bash
npm run cluster
```

Environment variables (optional) in a `.env` file:

```
API_VERSION=<Azure OpenAI model version>
AUTH_SCOPE=<Azure OpenAI scope>
API_ENDPOINT=https://<your-azure-endpoint>.openai.azure.com/
DEPLOYMENT_NAME=<Model name>
OLLAMA_BASE_URL=<Ollama url>
OLLAMA_MODEL=<Model name>
LLM_PROVIDER=<azure|ollama>
```

`LLM_PROVIDER` controls which backend `LLMClient` tries first. Omit it to default to Azure. With failover enabled (the default in `runClustering.ts`), the alternate provider is used automatically if the primary errors or returns an empty response.

### Model Backends

The clustering pipeline uses a unified model router: `LLMClient` (see `llmRouter.ts`).

Supported providers:

1. **Azure OpenAI** (enterprise / scalable)
2. **Ollama** local model (lightweight experimentation)

Selection logic:

- Default provider is `azure` unless overridden.
- Set an environment variable `LLM_PROVIDER=azure` or `LLM_PROVIDER=ollama` to choose globally.
- Internal calls in `runClustering.ts` pass `{ failover: true }` so if the chosen provider returns an empty string or throws, the other provider is attempted automatically.

### Using Ollama (Local LLM)

1. Install Ollama: https://ollama.com
2. Start the server:

```bash
ollama serve
```

3. Pull a model (example gemma3:1b):

```bash
ollama pull gemma3:1b
```

4. The local client in `llmClient.ts` uses model `gemma3:1b` by default. Adjust the `OLLAMA_MODEL` env var or modify the code. The router will forward `modelParameters` if you extend calls later.

To stop the Ollama service (system install):

```bash
sudo systemctl stop ollama
```

### Using Azure OpenAI

Set the required environment variables listed above. Authentication is handled through Azure CLI / Managed Identity chain:

```bash
az login
```

Then run:

```bash
npm run cluster
```

The router will use Azure first unless `LLM_PROVIDER=ollama` is set.

### Structured JSON vs Text Output

Structured output is preferred. This is a deviation from the original TnT approach since it was not widely available at time of publishing.

Currently this uses Zod-derived schemas (`InitialClusterListSchema`, `UpdatedClusterListSchema`). If parsing fails, the current code logs the raw string. To add a manual text fallback:

1. Detect parse failure.
2. Apply a simple regex or line-based heuristic to extract lines like `Name:`, `Description:`.
3. Reconstruct a minimal object and continue. You can specify and text output format when generating the prompts for custom parsing.

### Customization Tips

- Turn on summarization: set `SUMMARIZE_DATA = true` in `runClustering.ts`.
- Reduce cost / speed up: lower `DATA_LIMIT` or `NUMBER_OF_BATCHES`.


## Demo Chat Application (`/chatAppDemo`)

The `chatAppDemo/` folder contains the end‑to‑end demo used during the conference talk. It showcases:

- Travel assistant chat UI (React + Vite frontend)
- Backend classification
- Image assets and shared taxonomy JSON files (`/chatAppDemo/shared`)

Run it locally:

```bash
cd chatAppDemo
npm install   # (run once if not already installed)
npm run dev   # starts both frontend (Vite) and backen (express) if configured via scripts
```

Then open the printed local URL (typically http://localhost:5173). The backend expects any required Azure/Ollama env vars if you want live LLM responses; otherwise some features may return empty.

Directory highlights:

- `chatApp/backend` – Express server, classification, retrieval, offer logic.
- `chatApp/frontend` – React UI (badges, offers sidebar, travel theme).
- `chatApp/shared` – JSON taxonomies (intents, booking phases, offers) + images.
