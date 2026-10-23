'use client';

import { MessageSquareText, Sparkles, Square, Trash2, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { C, CARD_SHADOW } from '@/components/ui';
import { buildLiveSnapshot } from '@/lib/foreman/snapshot';
import { useKeenFlo } from '@/lib/use-keenflo';
import Markdown from './Markdown';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; error?: boolean };

const SUGGESTIONS = [
  'What should I fix first?',
  'What happened yesterday?',
  'Why is M-07 losing output?',
  'Compare all 3 shifts',
];

const PANEL_W = 380;
const PANEL_H = 560;

let nextId = 0;
const newId = () => `m${++nextId}`;

export default function Foreman() {
  const kf = useKeenFlo();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ---------------- open / close ---------------- */

  const close = useCallback(() => {
    setOpen(false);
    setMenuOpen(false);
    launcherRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Keep focus inside the panel while it is open.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  useEffect(() => {
    if (open) {
      setEverOpened(true);
      const id = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Keep the newest message in view as it streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, waiting]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* ---------------- the live shift, for the server ---------------- */

  const snapshotNow = useCallback(() => {
    if (!kf.data) return null;
    const live = kf.agg([{ kind: 'live', upToMinute: kf.tm }]);
    return buildLiveSnapshot({
      tm: kf.tm,
      tSeconds: kf.t,
      segments: kf.liveSegments,
      perMachine: live.per,
      total: live.total,
      openActions: kf.openActions(),
    });
  }, [kf]);

  /* ---------------- sending ---------------- */

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || streaming) return;

      const userMsg: Msg = { id: newId(), role: 'user', content: question };
      const replyId = newId();
      const history = [...messages, userMsg];

      setMessages([...history, { id: replyId, role: 'assistant', content: '' }]);
      setDraft('');
      setStreaming(true);
      setWaiting(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const fail = (msg: string) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === replyId ? { ...m, content: msg, error: true } : m))
        );

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            liveSnapshot: snapshotNow(),
          }),
        });

        if (!res.ok) {
          fail((await res.text()) || `Foreman could not answer (${res.status}).`);
          return;
        }
        if (!res.body) {
          fail('Foreman sent an empty answer. Please ask again.');
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        let gotFirst = false;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          if (!gotFirst) {
            gotFirst = true;
            setWaiting(false);
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, content: acc } : m))
          );
        }

        if (!acc.trim()) fail('Foreman had nothing to say about that. Try asking another way.');
      } catch {
        if (controller.signal.aborted) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyId && !m.content.trim()
                ? { ...m, content: 'Stopped.', error: true }
                : m
            )
          );
        } else {
          fail('Foreman could not be reached. Check your connection and try again.');
        }
      } finally {
        setWaiting(false);
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming, snapshotNow]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setMenuOpen(false);
    inputRef.current?.focus();
  }, []);

  const empty = messages.length === 0;
  const atLimit = messages.length >= 20;
  const counter = useMemo(() => `${draft.length}/1000`, [draft.length]);

  /* ---------------- launcher ---------------- */

  if (!open) {
    return (
      <div
        className="kf-no-print"
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {!everOpened ? (
          <span
            aria-hidden="true"
            style={{
              background: C.white,
              borderRadius: 999,
              boxShadow: '0 4px 14px rgba(45, 55, 72, 0.14)',
              padding: '9px 14px',
              fontSize: 13,
              fontWeight: 700,
              color: C.ink,
              whiteSpace: 'nowrap',
            }}
          >
            Ask Foreman
          </span>
        ) : null}
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Foreman, your plant assistant"
          aria-expanded={false}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: 0,
            background: C.teal,
            color: C.white,
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(79, 209, 197, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <Sparkles size={24} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    );
  }

  /* ---------------- panel ---------------- */

  return (
    <div
      className="kf-no-print"
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="Foreman, your plant assistant"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 60,
        width: `min(${PANEL_W}px, calc(100vw - 32px))`,
        height: `min(${PANEL_H}px, calc(100vh - 48px))`,
        background: C.white,
        borderRadius: 15,
        boxShadow: '0 18px 48px rgba(21, 25, 40, 0.22), ' + CARD_SHADOW,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 14px 14px 18px',
          borderBottom: `1px solid ${C.hair}`,
          flex: '0 0 auto',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            background: C.teal,
            color: C.white,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
          }}
        >
          <Sparkles size={17} strokeWidth={2.2} />
        </span>
        <span
          style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '1 1 auto', minWidth: 0 }}
        >
          <strong style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Foreman</strong>
          <span style={{ fontSize: 11, color: C.muted }}>Your plant assistant · live data</span>
        </span>

        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Chat options"
            aria-expanded={menuOpen}
            style={iconBtn}
          >
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1, fontWeight: 700 }}>
              ⋯
            </span>
          </button>
          {menuOpen ? (
            <div
              style={{
                position: 'absolute',
                top: 36,
                right: 0,
                background: C.white,
                borderRadius: 12,
                boxShadow: '0 8px 24px rgba(45, 55, 72, 0.18)',
                padding: 6,
                zIndex: 2,
                minWidth: 150,
              }}
            >
              <button
                type="button"
                onClick={clearChat}
                style={{
                  font: 'inherit',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 0,
                  background: 'transparent',
                  borderRadius: 8,
                  padding: '9px 10px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.ink,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
                Clear chat
              </button>
            </div>
          ) : null}
        </div>

        <button type="button" onClick={close} aria-label="Close Foreman" style={iconBtn}>
          <X size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      {/* messages */}
      <div
        ref={scrollRef}
        style={{
          flex: '1 1 auto',
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: C.page,
        }}
      >
        {empty ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: C.muted }}>
              Ask me anything about Peenya Unit 2 — the shift running right now, any machine,
              operator, downtime cause, or what to fix first.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  style={{
                    font: 'inherit',
                    textAlign: 'left',
                    border: `1px solid ${C.line}`,
                    background: C.white,
                    borderRadius: 12,
                    padding: '10px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.ink,
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div
                style={{
                  maxWidth: '85%',
                  background: C.teal,
                  color: C.white,
                  borderRadius: '14px 14px 4px 14px',
                  padding: '9px 13px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                style={{
                  maxWidth: '92%',
                  background: m.error ? 'rgba(229, 62, 62, 0.08)' : C.white,
                  color: m.error ? C.ink : C.ink,
                  border: m.error ? `1px solid rgba(229, 62, 62, 0.35)` : `1px solid ${C.hair}`,
                  borderRadius: '14px 14px 14px 4px',
                  padding: '10px 13px',
                  fontSize: 13,
                  wordBreak: 'break-word',
                }}
              >
                {m.content ? (
                  <Markdown text={m.content} />
                ) : (
                  <span style={{ color: C.faint }}>…</span>
                )}
              </div>
            </div>
          )
        )}

        {waiting ? (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              aria-live="polite"
              aria-label="Foreman is typing"
              style={{
                background: C.white,
                border: `1px solid ${C.hair}`,
                borderRadius: '14px 14px 14px 4px',
                padding: '12px 14px',
                display: 'flex',
                gap: 5,
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: C.grey,
                    animation: `kf-bounce 1.2s ${i * 0.15}s infinite ease-in-out`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* input */}
      <div
        style={{
          flex: '0 0 auto',
          borderTop: `1px solid ${C.hair}`,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: C.white,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <textarea
            ref={inputRef}
            value={draft}
            maxLength={1000}
            disabled={streaming || atLimit}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            placeholder={atLimit ? 'Chat is full — clear it to continue' : 'Ask about the plant…'}
            aria-label="Ask Foreman a question"
            style={{
              font: 'inherit',
              flex: '1 1 auto',
              minWidth: 0,
              resize: 'none',
              maxHeight: 96,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 13,
              lineHeight: 1.45,
              color: C.ink,
              background: streaming || atLimit ? C.page : C.white,
              outlineColor: C.teal,
            }}
          />
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop Foreman"
              style={{ ...sendBtn, background: C.white, color: C.ink, border: `1px solid ${C.line}` }}
            >
              <Square size={14} strokeWidth={2.6} fill={C.ink} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => send(draft)}
              disabled={!draft.trim() || atLimit}
              aria-label="Send question"
              style={{
                ...sendBtn,
                background: draft.trim() && !atLimit ? C.teal : C.line,
                color: C.white,
                cursor: draft.trim() && !atLimit ? 'pointer' : 'not-allowed',
              }}
            >
              <MessageSquareText size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: C.faint,
          }}
        >
          <span>Enter to send · Shift+Enter for a new line</span>
          <span>{counter}</span>
        </div>
      </div>

      <style>{`@keyframes kf-bounce{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-4px);opacity:1}}`}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  font: 'inherit',
  width: 32,
  height: 32,
  flex: '0 0 auto',
  border: 0,
  borderRadius: 10,
  background: 'transparent',
  color: C.muted,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

const sendBtn: React.CSSProperties = {
  font: 'inherit',
  width: 40,
  height: 40,
  flex: '0 0 auto',
  border: 0,
  borderRadius: 12,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};
