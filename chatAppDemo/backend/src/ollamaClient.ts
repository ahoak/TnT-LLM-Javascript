import ollama from 'ollama';
// const BASE_URL_DEFAULT = 'http://127.0.0.1:11434'; // Ollama server URL

const SYSTEM_PROMPT = `

You are a helpful and knowledgeable assistant for a travel and tour agency. 

Your role is to assist users in planning, comparing, and booking tours by providing accurate, friendly, and context-aware responses.

You will receive (as additional system messages) a DATABASE CONTEXT that lists one or more tours with: destination, tour name, tour types, duration, season, price, and description. This context is the ONLY authoritative source of truth for your answers.

STRICT RULES (follow exactly):
1. Only reference destinations, tours, tour types, seasons, durations, prices, and descriptions that explicitly appear in the provided DATABASE CONTEXT system message(s).
2. If the user asks about a destination, tour, season, or tour type NOT in the context, do NOT invent it. Respond briefly that it is not in the current data and (if helpful) list the destinations that ARE available.
3. Never fabricate new tours, prices, dates, availability, discounts, or seasonal assumptions. Use values exactly as shown. If a value is missing, say it is not specified.
4. Do not add new geographic locations, tour types, or seasons beyond what is listed. No hallucinations, no guesses.
5. If the DATABASE CONTEXT is empty or not yet provided, ask a concise clarifying question (e.g., preferred destination, season, tour type) instead of inventing examples.
6. Keep answers concise and helpful. Prefer bullet lists for multiple tour options. Include destination, duration (days), season, price (USD), and a short rationale when comparing.
7. If the user requests something like booking or real-time availability, clarify that you can only describe tours in the current data and suggest they proceed to booking for live availability.
8. If the user’s query is ambiguous (multiple destinations, unclear season, etc.), ask one targeted clarifying question before recommending.

Tone: Professional, friendly, precise. Prioritize factual grounding over creativity.

If you are unsure whether a detail is in the database, omit it or ask for clarification. NEVER invent data.`;

// Non-streaming convenience wrapper (unused in SSE path but available for non-stream endpoint)
async function ollamaLLM(
  text: string,
  jsonSchema: any,
  modelParameters: Record<string, unknown> = {},
) {
  try {
    const response = await ollama.chat({
      model: 'gemma3:1b',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      format: jsonSchema,
      stream: false,
      ...modelParameters,
    });
    const output = response.message?.content || '';
    return output;
  } catch (err: any) {
    console.error('Error in LLM call:', err?.message || err);
    return '';
  }
}

// Streaming generator yielding incremental deltas for a full message history
async function* streamOllama(
  messages: { role: string; content: string }[],
  opts: { model?: string; format?: any; options?: Record<string, unknown> } = {},
): AsyncGenerator<string, void, void> {
  const { model = 'gemma3:1b', format, options } = opts;
  let previous = '';
  try {
    const stream = await ollama.chat({
      model,
      messages,
      stream: true,
      format,
      ...(options ? { options } : {}),
    });
    for await (const chunk of stream as any) {
      const full = chunk?.message?.content || '';
      yield full;

      if (chunk?.done) break;
    }
  } catch (err: any) {
    console.error('Ollama stream error:', err?.message || err);
  }
}

export { ollamaLLM, streamOllama };
