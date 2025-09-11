# TnT-LLM-Javascript
Node implementation of classify unstructured text data using LLM and example application applying semantic telemetry information within chat 

## Clustering Pipeline (TnT-LLM Inspired)

This repo includes a lightweight TypeScript implementation of a text clustering workflow inspired by the Microsoft Research paper:

Text Mining at Scale with Large Language Models (TnT-LLM)
https://www.microsoft.com/en-us/research/publication/tnt-llm-text-mining-at-scale-with-large-language-models/

The approach here follows the paper’s core loop:
1. Sample / truncate raw conversation data (from Parquet) into summaries (optional step).
2. Generate an initial small taxonomy (cluster table) with an LLM.
3. Iteratively update / refine clusters with additional batches (rating + revision loop).
4. Final review / consolidation pass to produce the final cluster table.

Outputs are written as JSONL files to `./outputs` in the project root:
- `summaries_*.jsonl` (if summarization enabled)
- `finalClusterList_*.jsonl`

### Model Backends

You can run the pipeline using either:
1. Local LLM via Ollama (default lightweight experimentation) 
2. Azure OpenAI (enterprise / scalable)

The script prefers **structured JSON responses** (via JSON schema) for reliability. If a model can’t comply, you can adapt prompts to return plain text and write a small parser to extract cluster labels + descriptions (fallback mode not yet automated, but easy to add around the safe JSON parse helper in `runClustering.ts`).

### Data Input

Place Parquet files in `./data/` (project root). Only one sample Parquet file is needed to start; multiple files are concatenated. Adjust limits via environment variables or constants in `runClustering.ts`:
- `DATA_LIMIT` (number of rows to read)
- `NUMBER_OF_BATCHES` (controls total number of batches)
- `MAX_CLUSTERS` (max number of clusters to output)
- `CLUSTER_NAME_LENGTH` (cluster label length)

Quick start dataset (recommended for testing):
- WildChat conversations (AllenAI) – you only need a single shard/file (~1000 to 10,000) to validate the pipeline.
- Browse and download an individual file here:
	https://huggingface.co/datasets/allenai/WildChat-1M/tree/main/data

After downloading one `train-00000-of-000xx.parquet` file, place it in `./data/` and run the script. No need to download the full set for initial experimentation.

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
```

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
4. The local client in `llmClient.ts` uses model `gemma3:1b` by default. Adjust in code or pass via a modelParameters object.

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

### Structured JSON vs Text Output

We ask the model for JSON that matches Zod-derived schemas (`InitialClusterListSchema`, `UpdatedClusterListSchema`). If parsing fails, the current code logs the raw string. To add a manual text fallback:
1. Detect parse failure.
2. Apply a simple regex or line-based heuristic to extract lines like `Name:`, `Description:`.
3. Reconstruct a minimal object and continue.

### Customization Tips

- Turn on summarization: set `SUMMARIZE_DATA = true` in `runClustering.ts`.
- Reduce cost / speed up: lower `DATA_LIMIT` or `NUMBER_OF_BATCHES`.
- Increase taxonomy stability: raise initial batch size (merge first N batches before refinement) or add a consensus pass.
- Add guardrails: inject a system prompt prefix or temperature controls in `azureOpenaAIClient.ts` or `llmClient.ts`.

### Troubleshooting

Problem: `Data directory does not exist` — Ensure `./data` exists at project root.
Problem: Empty outputs — Increase `DATA_LIMIT` or check Parquet schema contains `conversation` + text segments.
Problem: JSON parse failures — Inspect logged raw LLM output; adjust prompt to emphasize strict JSON (e.g., “Return ONLY valid JSON, no markdown”).


