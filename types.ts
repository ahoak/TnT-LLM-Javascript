/* ========================
   Types / Interfaces
======================== */

export interface RawMessage {
  role?: string;
  content: string;
}

export interface ChatRecord {
  id?: string;
  conversation_hash?: string;
  conversation: RawMessage[];
  summary?: string;
  [k: string]: unknown;
}

export interface ClusterEntry {
  label: string;
  description?: string;
}

export interface TableRatingEntry {
  rating: number;
  explanation: string;
  suggestedEdits?: string;
}

export interface InitialClusterTable {
  table: TableRatingEntry;
}

export interface ClusterTable {
  tableRating: TableRatingEntry;
  updatedTable: ClusterEntry[];
}
