# Chat App Scaffold

A minimal full-stack TypeScript scaffold:

- Frontend: Vite + React + TypeScript (`frontend/`)
- Backend: Express + TypeScript (`backend/`)
- Shared types: `shared/types.ts`

## Features
- SSE streaming endpoint `POST /api/chat` with `stream: true`
- Non-streaming fallback with `stream: false`
- In‑memory conversation store
- Simple fake AI that just echoes the last user message (replace with real model API)

## Getting Started

### 1. Install dependencies
From repo root run:

```bash
(cd backend && npm install)
(cd frontend && npm install)
```

### 2. Run backend
```bash
cd backend
npm run dev
```
Backend starts on http://localhost:3000

### 3. Run frontend
```bash
cd frontend
npm run dev
```
Open http://localhost:5173

### 4. Try it
Type a prompt. Use "Send (Stream)" to see incremental tokens or "Send (Full)" for the complete reply.

## Replacing the Fake Model
In `backend/src/index.ts` swap `fakeModelStream` with real model logic (OpenAI, Anthropic, local, etc.). Emit chunks via `yield` for streaming.

## Build
```bash
cd backend && npm run build
cd frontend && npm run build
```

## Notes
- This is a demo scaffold; add persistence, auth, rate limits, and error handling before production use.
- CORS is restricted to `http://localhost:5173`; adjust as needed.
