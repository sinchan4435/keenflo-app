/**
 * The live shift.
 *
 * Shift C of today is not in the database. It is simulated in the browser from
 * the same deterministic engine the seed script used, so the demo always has a
 * shift in progress with no background server.
 *
 * Pure TypeScript. No React, no browser APIs. The hook in use-keenflo.ts owns
 * the timer and calls into this.
 */
import { SHIFT_MINUTES, ShiftCode } from './config';
import { MACHINES } from './plant';
import { Fixes, Segment, buildShift } from './sim-core';

/** The live shift is always shift C of day 0. */
export const LIVE_SHIFT: ShiftCode = 'C';
export const LIVE_DAY = 0;

/** Playback speeds offered in the sidebar. */
export const SPEEDS = [1, 10, 60] as const;
export type Speed = (typeof SPEEDS)[number];

/** How often the clock ticks, in real milliseconds. */
export const TICK_MS = 500;

/** Where the shift starts when the page loads: 03:45, five hours and 45 min in. */
export const START_SECONDS = 345 * 60;

/** The shift is over after 8 hours. */
export const END_SECONDS = SHIFT_MINUTES * 60;

export type LiveState = {
  /** Seconds elapsed in the shift. */
  t: number;
  speed: Speed;
  /** Shift minute at which each planted problem was fixed, if at all. */
  fixedAt: Record<string, number>;
};

export const initialLiveState: LiveState = {
  t: START_SECONDS,
  speed: 10,
  fixedAt: {},
};

/** Advance the clock by one tick. Returns the new seconds value. */
export function tick(t: number, speed: Speed): number {
  if (t >= END_SECONDS) return t;
  return Math.min(END_SECONDS, t + speed * (TICK_MS / 1000));
}

/** Seconds -> shift minute, capped at the end of the shift. */
export function shiftMinute(t: number): number {
  return Math.min(SHIFT_MINUTES, t / 60);
}

/**
 * Turn the action-item fix times into the engine's fix flags.
 * Resolving "Reduce short stops on M-07" at 03:10 means M-07 stops behaving
 * badly from shift minute 310 onwards.
 */
export function fixesFor(fixedAt: Record<string, number>): Fixes {
  return {
    stops: fixedAt.m07 ?? null,
    slow: fixedAt.m12 ?? null,
    co: fixedAt.linec ?? null,
    rej: fixedAt.m18 ?? null,
  };
}

/** The untouched live shift: what tonight looks like if nobody fixes anything. */
export function buildLiveBaseline(): Segment[][] {
  return MACHINES.map((_, mi) => buildShift(mi, LIVE_DAY, LIVE_SHIFT, null));
}

/**
 * The live shift with the operator's fixes applied.
 * Machines with no fix reuse the baseline array, so this is cheap to recompute.
 */
export function buildLiveShift(
  baseline: Segment[][],
  fixedAt: Record<string, number>
): Segment[][] {
  const fix = fixesFor(fixedAt);
  return MACHINES.map((m, mi) => {
    const fx: Fixes = {};
    if (m.id === 'M-07' && fix.stops != null) fx.stops = fix.stops;
    if (m.id === 'M-12' && fix.slow != null) fx.slow = fix.slow;
    if (m.line === 'C' && fix.co != null) fx.co = fix.co;
    return Object.keys(fx).length ? buildShift(mi, LIVE_DAY, LIVE_SHIFT, fx) : baseline[mi];
  });
}
