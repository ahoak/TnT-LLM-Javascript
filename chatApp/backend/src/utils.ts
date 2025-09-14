import type { 
  NormalizedTourRecord,
  DestinationRecord,
  NormalizedTourTypeRecord,
  Conversation

} from '../../shared/types.js';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import databaseRecords from '../../shared/mockDatabase.json' with { type: 'json' };

const metadataLabelsSchemaObject = z.object({
  intent: z.string().describe('The intent of the booking'),
  bookingPhase: z.string().describe('The phase of the booking process'),
  tourType: z.string().describe('The type of tour being booked')
});

export const metadataLabelsSchema = zodToJsonSchema(metadataLabelsSchemaObject);

const destinationRecordSchemaObject = z.object({
  destination: z.string().describe('The intent of the booking'),
  tourName: z.string().describe('The phase of the booking process'),
  tourTypes: z.string().describe('Comma-separated list of tour types'),
  season: z.string().describe('Season for the tour'),
  durationDays: z.number().describe('Duration of the tour in days'),
  priceUSD: z.number().describe('Price of the tour in USD'),
  description: z.string().describe('Description of the tour')
});
 const destinationRecordSchemaList = z.object({
  table: z.array(destinationRecordSchemaObject).describe('An array of clusters and their descriptions for updated taxonomy')
});
export const destinationRecordSchema= zodToJsonSchema(destinationRecordSchemaList);


export const adSchema= zodToJsonSchema(z.object({
  id: z.string().describe('Id of the advertisement'),
}).describe('Advertisement id schema'));

export interface MetaDataLabels {
  intent?: string;
  bookingPhase?: string;
}

export interface ClassificationAdResponse extends MetaDataLabels {
    id?: string; // advertisement id
    raw?: string; // raw LLM response for debugging
}


export const conversations = new Map<string, Conversation>();
/**
 * Normalize database records into unified tour objects with attached destination and tourTypes.
 */
export function normalizeTourType(db: typeof databaseRecords): NormalizedTourRecord[] {
  if (!db) return [];
  const destIdx = new Map<string, DestinationRecord>(
    (db.destinations || []).map((d: any) => [d.id, { id: d.id, name: d.name, description: d.description }])
  );
  const tourTypeIdx = new Map<string, NormalizedTourTypeRecord>(
    (db.tour_types || []).map((t: any) => [
      t.id,
      {
        id: t.id,
        name: t.name ?? t.tour_type ?? 'Unknown',
        description: t.description ?? t.definition ?? ''
      }
    ])
  );
  return (db.tours || []).map((tour: any) => {
    const tourTypes: NormalizedTourTypeRecord[] = (tour.tour_type_ids || [])
      .map((id: string) => tourTypeIdx.get(id))
      .filter(Boolean) as NormalizedTourTypeRecord[];
    return {
      ...tour,
      destination: destIdx.get(tour.destination_id),
      tourTypes
    } as NormalizedTourRecord;
  });
}


export function formatRetrievalContext(query: string, db: typeof databaseRecords, maxResults = 5): string {
  if (!query?.trim()) return '';
  const normalized = normalizeTourType(db);
  if (!normalized.length) return '';
  const tokens = Array.from(new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)));
  if (!tokens.length) return '';
  type Scored = NormalizedTourRecord & { _score: number; _matched: string[] };
  const scored: Scored[] = normalized.map(t => {
    const haystack = [
      t.name,
      t.description,
      t.destination?.name,
      t.destination?.description,
      ...t.tourTypes.map(tt => tt.name),
      ...t.tourTypes.map(tt => tt.description)
    ].filter(Boolean).join(' ').toLowerCase();
    let score = 0; const matched: string[] = [];
    for (const tok of tokens) {
      if (haystack.includes(tok)) {
        matched.push(tok);
        const occ = haystack.split(tok).length - 1;
        score += 1 + Math.min(occ, 3) * 0.25;
      }
    }
    return { ...t, _score: score, _matched: matched } as Scored;
  });
  const top = scored.filter(s => s._score > 0).sort((a, b) => b._score - a._score).slice(0, maxResults);
  if (!top.length) return '';
  const lines = top.map(t => {
    const tt = t.tourTypes.map(tt => tt.name).join(', ') || 'N/A';
    return `- ${t.name} (id: ${t.id}) | Destination: ${t.destination?.name || 'Unknown'} | Types: ${tt} | Duration: ${t.duration_days} days | Season: ${t.season} | PriceUSD: ${t.price_usd}\n  MatchedTerms: ${t._matched.join(', ') || 'None'}\n  Description: ${t.description}`;
  });
  return `DATABASE CONTEXT (top matches for: "${query}")\n${lines.join('\n')}`;
}





export function safeJSONParse<T = any>(raw: string): { ok: true; value: T } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch (e) {
    return { ok: false, error: e as Error };
  }
}



export function getOrCreateConversation(id?: string): Conversation {
  if (id && conversations.has(id)) return conversations.get(id)!;
  const newConv = { id: id ?? nanoid(), messages: [] };
  conversations.set(newConv.id, newConv);
  return newConv;
}
