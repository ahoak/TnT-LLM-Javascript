import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatResponseChunk, ChatFullResponse, TopicClassificationResponse } from '../../../shared/types.ts';

interface PendingMessage {
  id: string;
  role: 'assistant';
  content: string;
}

export const Chat: React.FC = () => {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingId]);

  async function classifyTopic(nextConversationId: string | undefined, msgs: ChatMessage[]) {
    try {
      setTopicLoading(true);
      const body: any = nextConversationId ? { conversationId: nextConversationId } : { messages: msgs.map(m => ({ role: m.role, content: m.content })) };

      const resp = await fetch('http://localhost:3000/api/classify-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) return;
      const data: TopicClassificationResponse = await resp.json();
      setTopic(data.label);
    } catch (e) {
      // silent
    } finally {
      setTopicLoading(false);
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
      const resp = await fetch('http://localhost:3000/api/chat', {
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
              classifyTopic(conversationId ?? chunk.conversationId, messages);
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

    const resp = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, messages: [{ role: 'user', content: userContent }], stream: false })
    });
    const data: ChatFullResponse = await resp.json();
    setConversationId(data.conversationId);
    setMessages((prev: ChatMessage[]) => {
      const next = [...prev, data.message];
      // classify after full response
      classifyTopic(data.conversationId, next);
      return next;
    });
  }, [conversationId, input]);



  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto', padding: '1rem' }}>
  <h1>AI Chat {(topicLoading || topic) && (
    <span style={{ fontSize: '0.6em', fontWeight: 400, marginLeft: 8, color: '#555' }}>
      Topic: {topicLoading ? 'Detecting…' : topic}
    </span>
  )}</h1>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, minHeight: 300, background: '#fafafa' }}>
        {messages.map(m => (
          <div key={m.id} style={{ padding: '4px 0' }}>
            <strong>{m.role === 'user' ? 'You' : 'AI'}:</strong> {m.content}
          </div>
        ))}
        {streamingId && (
          <div style={{ opacity: 0.7 }}>AI is typing...</div>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={e => { e.preventDefault(); send(true); }} style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask something..."
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={!input.trim()}>Send (Stream)</button>
        <button type="button" onClick={() => send(false)} disabled={!input.trim()}>Send (Full)</button>
      </form>
    </div>
  );
};
