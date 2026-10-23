/**
 * Foreman's system prompt and the model it runs on.
 *
 * This file is imported by the server route only. It contains no secrets.
 */

/**
 * The model Foreman uses.
 *
 * Set GEMINI_MODEL in the environment to override it.
 *
 * The fallback below was verified against this project's API key: it appears in
 * `ai.models.list()` and answers a real streaming call. It was picked over the
 * newer gemini-3.8-flash and gemini-3.7-flash because those answered the same
 * prompt in 10-200 seconds while this one answers in about 3, and a chat popup
 * that takes three minutes to reply is no use on a shop floor.
 */
export const DEFAULT_MODEL = 'gemini-3.6-flash';

export function resolveModel(): string {
  const fromEnv = process.env.GEMINI_MODEL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_MODEL;
}

export const SYSTEM_PROMPT = `You are Foreman, the production assistant for Peenya Unit 2, a 20-machine factory. Answer ONLY from the plant data provided. If the data doesn't contain the answer, say so plainly. Be short and direct: 2-5 sentences or a short list. Always name machine IDs, operators, shifts and numbers. Show money as ₹ with Indian formatting (₹2.34 lakh). When asked what to fix, rank by ₹ lost and give concrete practical fix steps a plant manager or maintenance team can act on today. Use plain words, no OEE jargon. Never invent machines, people or numbers.`;

/** Wrap the plant data in a clearly marked block, with the time it describes. */
export function buildContext(parts: {
  istNow: string;
  istDate: string;
  live: string;
  history: string;
}): string {
  return [
    '=== PLANT DATA ===',
    `Today's date (IST): ${parts.istDate}`,
    `Current time (IST): ${parts.istNow}`,
    '',
    '--- LIVE SHIFT (happening right now) ---',
    parts.live,
    '',
    '--- HISTORY FROM THE DATABASE ---',
    parts.history,
    '=== END PLANT DATA ===',
  ].join('\n');
}
