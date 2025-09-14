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

export interface ClassificationResponse {
  intent?: string;
  bookingPhase?: string;
  tourType?: string;
  raw?: string; // raw LLM output before normalization
}

export interface Conversation {
  id: string;
  messages: ChatMessage[];
}

export interface BookingIntent {
  intent: string;
  definition: string;
  inclusions: string[];
  exclusions: string[];
  example: string;
}

// -----------------------------
// Database Records Typings
// -----------------------------
export interface DestinationRecord {
  id: string;
  name: string;
  description: string;
}

export interface TourTypeRecordRaw {
  id: string;
  name?: string;            // Some entries use name/description
  description?: string;
  tour_type?: string;       // Some entries use tour_type/definition
  definition?: string;
}

export interface TourRecord {
  id: string;
  name: string;
  destination_id: string;
  tour_type_ids: string[];
  duration_days: number;
  price_usd: number;
  season: string;
  description: string;
}

export interface NormalizedTourTypeRecord {
  id: string;
  name: string;       // unified display name
  description: string; // unified description/definition
}

export interface NormalizedTourRecord extends TourRecord {
  destination?: DestinationRecord;
  tourTypes: NormalizedTourTypeRecord[];
}