import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatResponseChunk, ChatFullResponse, ClassificationResponse, AdvertisementOffer } from '../../../shared/types.ts';

// Vite environment variable (define VITE_API_URL in .env if overriding backend URL)
const BASE_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3000';

export const Chat: React.FC = () => {
  // use CSS classes for badges under new theme
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [userIntent, setIntent] = useState<string | null>(null);
  const [userBookingPhase, setBookingPhase] = useState<string | null>(null);
  const [userTourType, setTourType] = useState<string | null>(null);
  const [userAdContent, setUserAdContent] = useState<AdvertisementOffer[]>([]);
  const [userIntentLoading, setIntentLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingId]);

  async function classifyuserIntent(nextConversationId: string | undefined, msgs: ChatMessage[]) {
    try {
      setIntentLoading(true);
      const body: any = nextConversationId ? { conversationId: nextConversationId } : { messages: msgs.map(m => ({ role: m.role, content: m.content })) };

      const resp = await fetch(`${BASE_URL}/api/classify-topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) return;
      const data: ClassificationResponse = await resp.json();
      console.log("ClassificationResponse:", data);
      setIntent(data.intent || null);
      setBookingPhase(data.bookingPhase || null);
      setTourType(data.tourType || null);
      setUserAdContent( data.offers || []);
    } catch (e) {
      // silent
    } finally {
      setIntentLoading(false);
    }
  }

  const send = useCallback(async (stream: boolean) => {
    const userContent = input.trim();
    if (!userContent) return;
    setInput('');

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      createdAt: new Date().toISOString()
    };
  setMessages((prev: ChatMessage[]) => [...prev, userMessage]);

  if (stream) {
      const resp = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          messages: [{ role: 'user', content: userContent }],
          stream: true
        })
      });
      if (!resp.body) return;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let assistantId: string | null = null;
      setStreamingId(assistantId);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const evt of events) {
          if (!evt.startsWith('data: ')) continue;
          const payload = evt.slice(6);
          try {
            const chunk: ChatResponseChunk = JSON.parse(payload);
            if (!assistantId) {
              assistantId = chunk.id;
              setStreamingId(chunk.id);
            }
            setConversationId(chunk.conversationId);
            if (chunk.done) {
              setStreamingId(null);
              // classify after streaming completion
              await classifyuserIntent(conversationId ?? chunk.conversationId, messages);
            } else {
              setMessages((prev: ChatMessage[]) => {
                const existingIndex = prev.findIndex((m: ChatMessage) => m.id === chunk.id);
                if (existingIndex >= 0) {
                  const copy = [...prev];
                  copy[existingIndex] = { ...copy[existingIndex], content: copy[existingIndex].content + chunk.delta };
                  return copy;
                } else {
                  return [
                    ...prev,
                    {
                      id: chunk.id,
                      role: 'assistant',
                      content: chunk.delta,
                      createdAt: new Date().toISOString()
                    }
                  ];
                }
              });
            }
          } catch (e) {
            console.error('Bad chunk', e, payload);
          }
        }
      }
      return;
    }

    const resp = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, messages: [{ role: 'user', content: userContent }], stream: false })
    });
    const data: ChatFullResponse = await resp.json();
    setConversationId(data.conversationId);
    setMessages((prev: ChatMessage[]) => {
      const next = [...prev, data.message];
      // classify after full response
      classifyuserIntent(data.conversationId, next);
      return next;
    });
  }, [conversationId, input]);



  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 1160, margin: '0 auto', padding: '0 1rem 2rem' }} id="chat-root">
      <h2 style={{ marginBottom: 8 }}>Travel Assistant</h2>
      <p style={{ margin: '0 0 1.2rem', fontSize: '0.95rem', color: 'var(--color-text-muted)' }}>Ask about destinations, tour styles, seasons or planning phases — I’ll tailor context & offers.</p>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28 }}>
        {/* Left Column (Chat) */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Chat Panel with fixed height and internal scroll */}
          <div className="card" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '68vh',
            maxHeight: '68vh',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden'
          }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 10px', scrollbarWidth: 'thin', background: 'var(--color-surface)' }}>
              {messages.map(m => (
                <div key={m.id} style={{ padding: '4px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  <strong>{m.role === 'user' ? 'You' : 'AI'}:</strong> {m.content}
                </div>
              ))}
              {streamingId && (
                <div style={{ opacity: 0.7, fontStyle: 'italic', marginTop: 4, fontSize: '.7rem', color: 'var(--color-text-muted)' }}>Assistant is composing…</div>
              )}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={e => { e.preventDefault(); send(true); }} style={{ display: 'flex', gap: 10, padding: '12px 14px 14px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-alt)' }}>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask anything travel..." style={{ flex: 1, padding: '11px 13px', border: '1px solid var(--color-border)', borderRadius: 10, fontSize: '.85rem', background: '#fff', fontFamily: 'var(--font-body)' }} />
              <button type="submit" disabled={!input.trim()} className="btn btn-primary" style={{ opacity: input.trim() ? 1 : 0.55, cursor: input.trim() ? 'pointer' : 'not-allowed', fontSize: '.8rem' }}>Send</button>
            </form>
          </div>
          {(userIntentLoading || userIntent || userBookingPhase || userTourType) && (
            <div className="section-soft" style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {(userIntentLoading || userIntent) && (
                <span className="badge">
                  <span className="badge-label">Intent</span>
                  {userIntentLoading ? 'Detecting…' : userIntent}
                </span>
              )}
              {userBookingPhase && (
                <span className="badge">
                  <span className="badge-label">Phase</span>
                  {userBookingPhase}
                </span>
              )}
              {userTourType && (
                <span className="badge">
                  <span className="badge-label">Tour Type</span>
                  {userTourType}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right Column (Offers Sidebar) */}
        <aside style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {userAdContent.length > 0 && (
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: 0.6 }}>Recommended Offers</div>
          )}
          {userAdContent.length === 0 && (
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>No offers yet. Ask about destinations or trip styles to surface suggestions.</div>
          )}
          {userAdContent.map((ad, index) => (
            <div key={index} className="offer-card">
              {ad.imageUrl && (
                <img src={`${BASE_URL}/shared/images/${ad.imageUrl}`} alt={ad.title} style={{ width: '100%', height: 'auto', objectFit: 'cover' }} loading="lazy" />
              )}
              <div className="offer-title">{ad.title}</div>
              <p className="offer-desc">{ad.description.length > 140 ? ad.description.slice(0, 137) + '…' : ad.description}</p>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
};
