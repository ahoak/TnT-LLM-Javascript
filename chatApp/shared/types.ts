export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string; // ISO timestamp
}

export interface ChatRequest {
  conversationId?: string;
  messages: Omit<ChatMessage, 'id' | 'createdAt'>[];
  stream?: boolean;
  model?: string;                 // optional model name override
  jsonSchema?: any;               // optional JSON schema for structured output
  options?: Record<string, any>;  // provider-specific generation options (temperature, etc.)
}

export interface ChatResponseChunk {
  id: string;              // message id
  conversationId: string;
  role: 'assistant';
  delta: string;           // incremental token(s)
  done: boolean;           // true when final chunk
}

export interface ChatFullResponse {
  conversationId: string;
  message: ChatMessage;
}

// Topic classification
export interface TopicClassificationRequest {
  conversationId?: string;
  // Optional ad-hoc messages if no conversation id yet
  messages?: { role: string; content: string }[];
}

export interface TopicClassificationResponse {
  label: string;
  raw?: string; // raw LLM output before normalization
}
