# Travel Assistant Demo (LLM Classification Showcase)

This `chatAppDemo` directory contains a demo full‑stack application that showcases how to integrate **LLM‑based classifiers** into a user-facing travel assistant experience. It uses fictional but structured taxonomies to classify each conversation turn by:

1. **User Intent** – e.g. reservation inquiry, cancel tour, etc.
2. **Booking Phase** – e.g. pre-booking, booking-in-progress, post-booking
3. **Tour Type** – e.g. adventure, cultural, etc

The backend invokes an LLM to produce structured JSON for these classifiers and surfaces relevant promotional offers matched to the inferred context. The frontend renders the conversation, dynamic badges, and suggested offers.

## Architecture

- **Frontend**: React + Vite (`frontend/`)
- **Backend**: Express + TypeScript (`backend/`)
- **Shared**: Cross‑loaded JSON taxonomies & types (`shared/`)

Key flows:

- Chat messages POST to `/api/chat` (supports streaming or full responses).
- After each assistant reply, a classification request derives intent / booking phase / tour type.
- Offers are filtered and returned with image metadata.

## Running the Demo

From within `chatAppDemo/` run:

```bash
npm run dev
```

This will (if configured in the root scripts) start the backend and frontend (or you can open two terminals and run each `dev` script inside `backend` and `frontend`). Then open the printed Vite URL (typically `http://localhost:5173`).

If using environment‑based model backends (Azure OpenAI or Ollama) ensure you have the necessary env vars set at the repo root before starting so the backend can classify with a live model. Without them, you may see empty or stubbed classification results.

## Environment Variables (Optional)
Place env vars in a `.env` in `/backend` folder. To set LLM:
CHATAPP_LLM_PROVIDER=<ollama> // or azure 
See parent repo `README.md` for the full list (`LLM_PROVIDER`, Azure auth vars, Ollama settings). 
