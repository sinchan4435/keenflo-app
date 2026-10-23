/**
 * Foreman's chat endpoint.
 *
 * This is the ONLY place GEMINI_API_KEY is read. It never reaches the browser.
 */
import { GoogleGenAI } from '@google/genai';
import { NextRequest } from 'next/server';

import { getHistorySummary } from '@/lib/foreman/history';
import { SYSTEM_PROMPT, buildContext, resolveModel } from '@/lib/foreman/prompt';
import { LiveSnapshot, snapshotToText } from '@/lib/foreman/snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ */
/* limits                                                              */
/* ------------------------------------------------------------------ */

const MAX_MESSAGES = 20;
const MAX_CHARS = 1000;

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

/** Request times per IP. Fine for one server; it resets on redeploy. */
const hits = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function overRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);

  // Keep the map from growing forever on a long-lived server.
  if (hits.size > 500) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function textResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function istParts(): { istDate: string; istNow: string } {
  const now = new Date(Date.now() + 330 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getUTCDay()];
  const month = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][now.getUTCMonth()];
  return {
    istDate: `${weekday} ${now.getUTCDate()} ${month} ${now.getUTCFullYear()}`,
    istNow: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} IST`,
  };
}

function validate(body: unknown): { messages: ChatMessage[]; snapshot: LiveSnapshot | null } | string {
  if (!body || typeof body !== 'object') return 'Expected a JSON object.';
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.messages)) return 'Expected "messages" to be an array.';
  if (b.messages.length === 0) return 'Send at least one message.';
  if (b.messages.length > MAX_MESSAGES)
    return `Too many messages. Keep the conversation under ${MAX_MESSAGES} turns, or clear the chat.`;

  const messages: ChatMessage[] = [];
  for (const raw of b.messages) {
    if (!raw || typeof raw !== 'object') return 'Each message must be an object.';
    const m = raw as Record<string, unknown>;
    if (m.role !== 'user' && m.role !== 'assistant')
      return 'Each message needs a role of "user" or "assistant".';
    if (typeof m.content !== 'string') return 'Each message needs string content.';
    if (m.content.length > MAX_CHARS)
      return `That message is too long. Keep each one under ${MAX_CHARS} characters.`;
    messages.push({ role: m.role, content: m.content });
  }
  if (messages[messages.length - 1].role !== 'user')
    return 'The last message must come from the user.';

  const snapshot =
    b.liveSnapshot && typeof b.liveSnapshot === 'object'
      ? (b.liveSnapshot as LiveSnapshot)
      : null;

  return { messages, snapshot };
}

/* ------------------------------------------------------------------ */
/* route                                                               */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return textResponse(
      'Foreman is offline: API key not configured. Add GEMINI_API_KEY to your environment and restart the server.',
      200
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return textResponse('That request was not valid JSON.', 400);
  }

  const parsed = validate(body);
  if (typeof parsed === 'string') return textResponse(parsed, 400);

  if (overRateLimit(clientIp(req))) {
    return textResponse(
      'You have asked Foreman a lot of questions in a short time. Please wait a few minutes and try again.',
      429
    );
  }

  /* ---- build the context ---- */
  let history: string;
  try {
    history = (await getHistorySummary()).text;
  } catch (e) {
    history =
      'The plant history could not be read from the database right now: ' +
      (e instanceof Error ? e.message : 'unknown error');
  }

  const live = parsed.snapshot
    ? snapshotToText(parsed.snapshot)
    : 'The live shift is not available in this request.';

  const { istDate, istNow } = istParts();
  const context = buildContext({ istDate, istNow, live, history });

  /* ---- ask Gemini ---- */
  const ai = new GoogleGenAI({ apiKey });
  const model = resolveModel();

  // The newest question carries the plant data; earlier turns are plain history.
  const contents = parsed.messages.map((m, i) => {
    const isLast = i === parsed.messages.length - 1;
    return {
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: isLast ? `${context}\n\nQuestion: ${m.content}` : m.content }],
    };
  });

  // Gemini sometimes answers 503 "model is overloaded". That clears in a second
  // or two, so retry quietly rather than showing the user an error.
  const TRANSIENT = new Set(['429', '500', '502', '503', '504']);
  let stream: AsyncGenerator<{ text?: string }> | null = null;
  let lastCode: string | undefined;

  for (let attempt = 0; attempt < 4 && stream === null; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 700 * attempt));
      if (req.signal.aborted) return textResponse('', 200);
    }
    try {
      stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.2,
          maxOutputTokens: 2000,
          abortSignal: req.signal,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      lastCode = message.match(/"code":\s*(\d+)/)?.[1];
      if (!lastCode || !TRANSIENT.has(lastCode)) break;
    }
  }

  if (stream === null) {
    if (lastCode === '429')
      return textResponse(
        'Foreman has hit the Gemini rate limit for now. Please try again in a minute.',
        200
      );
    if (lastCode && TRANSIENT.has(lastCode))
      return textResponse(
        'Foreman is busy: the Gemini model is under heavy load right now. Please try again in a moment.',
        200
      );
    return textResponse(
      `Foreman could not reach Gemini (${lastCode ?? 'error'}). Please try again.`,
      200
    );
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch {
        if (!req.signal.aborted) {
          controller.enqueue(
            encoder.encode(
              '\n\n_Foreman lost the connection to Gemini part way through. Please ask again._'
            )
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
