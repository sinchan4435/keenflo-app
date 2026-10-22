/**
 * The deterministic production engine.
 *
 * This is a direct port of the simulation in /design. It is pure TypeScript
 * with no browser or Node APIs, so the seed script and the browser both run it
 * and get byte-identical numbers.
 *
 * A "segment" is a stretch of one shift where a machine was in one state.
 * Shift minutes run 0..480 (480 = 8 hours).
 */
import {
  MachineState,
  RATE_PER_MIN,
  SHIFT_MINUTES,
  SLOW_FACTOR,
  ShiftCode,
} from './config';
import { LINE_C_IDS, MACHINES, MACHINE_INDEX, Machine } from './plant';

export type Segment = {
  st: MachineState;
  /** Shift minute the segment starts at. */
  s: number;
  /** Shift minute the segment ends at. */
  e: number;
  /** Downtime cause, for stop and changeover segments. */
  reason: string;
  /** Speed factor while running. 1 = rated, 0.88 = running slow. */
  sf: number;
};

/** Minute of the shift at which each planted problem was fixed, if at all. */
export type Fixes = {
  stops?: number | null;
  slow?: number | null;
  co?: number | null;
  rej?: number | null;
};

/* ------------------------------------------------------------------ */
/* seeded random                                                       */
/* ------------------------------------------------------------------ */

/** Mulberry32. Same seed in, same sequence out, on every machine. */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* planted problems                                                    */
/* ------------------------------------------------------------------ */

type RunParams = {
  /** Mean minutes between short stops. */
  mtbs: number;
  stopMin: number;
  stopMax: number;
  /** Share of running stretches that run slow. */
  slowShare: number;
  /** Speed factor while running slow. */
  sf: number;
};

function params(
  m: Machine,
  t: number,
  night: boolean,
  yesterdayNight: boolean,
  fx: Fixes
): RunParams {
  const p: RunParams = {
    mtbs: yesterdayNight ? 34 : night ? 150 : 115,
    stopMin: 0.8,
    stopMax: 2.0,
    slowShare: 0.03,
    sf: SLOW_FACTOR,
  };

  // M-07: frequent short stops, far worse on the night shift between 02:00-04:00.
  if (m.id === 'M-07' && !(fx.stops != null && t >= fx.stops)) {
    if (!night) {
      p.mtbs = 24;
      p.stopMin = 1.5;
      p.stopMax = 3.5;
    } else {
      const inWindow = t >= 240 && t < 360;
      p.mtbs = inWindow ? (yesterdayNight ? 1.1 : 1.4) : yesterdayNight ? 11 : 40;
      p.stopMin = 2;
      p.stopMax = 4.2;
    }
  }

  // M-12: always runs about 12% below rated speed.
  if (m.id === 'M-12' && !(fx.slow != null && t >= fx.slow)) {
    p.slowShare = 1;
    p.sf = SLOW_FACTOR;
  }

  return p;
}

/**
 * M-18 rejects climb from about 1% to about 6% after four hours of running.
 * Returns the average reject rate over the window [s, e] of the shift.
 */
export function rejectRate(
  m: Machine,
  s: number,
  e: number,
  fixRejectsAt?: number | null
): number {
  const base = m.line === 'C' ? 0.008 : 0.005;
  if (m.id !== 'M-18' || e <= s) return base;
  const k = 0.065 / 240;
  const cut = fixRejectsAt != null ? Math.min(e, Math.max(s, fixRejectsAt)) : e;
  const F = (v: number) => (v <= 240 ? 0 : ((v - 240) * (v - 240)) / 2);
  const integral = cut > s ? F(cut) - F(s) : 0;
  return base + (k * integral) / (e - s);
}

/* ------------------------------------------------------------------ */
/* build one machine-shift                                             */
/* ------------------------------------------------------------------ */

/**
 * Build the segment list for one machine on one shift.
 *
 * @param mi       machine index in MACHINES
 * @param d        day offset: 0 = today, -1 = yesterday
 * @param sh       shift code
 * @param fx       minute each problem was fixed at, for the live shift only
 */
export function buildShift(
  mi: number,
  d: number,
  sh: ShiftCode,
  fx: Fixes | null
): Segment[] {
  const fixes: Fixes = fx || {};
  const m = MACHINES[mi];
  const night = sh === 'C';
  const live = d === 0 && night;
  const yesterdayNight = d === -1 && night;

  // The labeller has no order on nights.
  if (night && m.id === 'M-20') {
    return [{ st: 'idle', s: 0, e: SHIFT_MINUTES, reason: 'No order scheduled', sf: 1 }];
  }

  const base = (mi + 1) * 7919 + (d + 20) * 104729 + ['A', 'B', 'C'].indexOf(sh) * 1299709;
  const re = rng(base);
  const rr = rng(base * 3 + 17);

  type RawEvent = { s: number; e: number; st: MachineState; reason: string };
  const raws: RawEvent[] = [];
  const add = (s: number, dur: number, st: MachineState, reason: string) =>
    raws.push({ s, e: s + dur, st, reason });

  // Changeovers. Line C changeovers run about twice the 30 min standard.
  if (m.line === 'C') {
    const ci = LINE_C_IDS.indexOf(m.id);
    const happens = night ? true : re() < 0.4;
    const start = night ? [10, 60, 120, 190, 290][ci] + re() * 8 : 30 + re() * 380;
    const raw = re();
    const fixed = fixes.co != null && start >= fixes.co;
    if (happens) add(start, fixed ? 28 + raw * 6 : 54 + raw * 14, 'co', 'Setup/changeover');
  } else {
    const h = re() < 0.12;
    const start = 60 + re() * 340;
    const raw = re();
    if (h) add(start, 18 + raw * 12, 'co', 'Setup/changeover');
  }

  const cnc = m.line === 'A' || m.line === 'B';
  let x: number[];
  x = [re(), re(), re()];
  if (x[0] < 0.1) add(x[1] * 440, 10 + x[2] * 18, 'stop', 'Waiting for material');
  x = [re(), re(), re()];
  if (cnc && x[0] < 0.22) add(x[1] * 440, 7 + x[2] * 8, 'stop', 'Tool change');
  x = [re(), re(), re()];
  if (!yesterdayNight && x[0] < 0.025) add(x[1] * 420, 25 + x[2] * 45, 'stop', 'Breakdown');
  x = [re(), re(), re()];
  if (x[0] < 0.03) add(x[1] < 0.5 ? 0 : 230, 10 + x[2] * 20, 'stop', 'No operator');
  x = [re(), re(), re()];
  if (x[0] < (m.line === 'C' ? 0.07 : 0.03)) add(x[1] * 440, 15 + x[2] * 20, 'stop', 'Quality hold');
  // M-03 used to trip its coolant pump. That was fixed four days ago.
  x = [re(), re(), re()];
  if (m.id === 'M-03' && d < -4 && x[0] < 0.7) add(x[1] * 420, 25 + x[2] * 18, 'stop', 'Breakdown');

  // Scripted events that make last night the worst shift of the week.
  if (yesterdayNight) {
    if (m.id === 'M-09') add(130, 48, 'stop', 'Breakdown');
    if (m.id === 'M-13') add(380, 35, 'stop', 'Quality hold');
    if (m.id === 'M-16' || m.id === 'M-17' || m.id === 'M-19')
      add(300, 58, 'stop', 'Waiting for material');
    if (m.id === 'M-03') add(0, 55, 'stop', 'No operator');
    if (m.id === 'M-01' || m.id === 'M-02') add(200, 30, 'stop', 'Waiting for material');
  }
  if (live) {
    if (m.id === 'M-17') add(185, 18, 'stop', 'Waiting for material');
  }

  // Resolve overlaps, keeping a 3 minute gap after each event.
  raws.sort((a, b) => a.s - b.s);
  const events: { st: MachineState; reason: string; s: number; e: number }[] = [];
  let last = 0;
  for (const e of raws) {
    const dur = e.e - e.s;
    const s = Math.max(e.s, last);
    if (s >= SHIFT_MINUTES - 1) continue;
    const en = Math.min(SHIFT_MINUTES, s + dur);
    events.push({ st: e.st, reason: e.reason, s, e: en });
    last = en + 3;
  }

  // Fill the gaps between events with running, slow and short-stop segments.
  const segs: Segment[] = [];
  const push = (st: MachineState, s: number, e: number, reason: string, sf: number) => {
    if (e > s + 1e-9) segs.push({ st, s, e, reason, sf });
  };

  let t = 0;
  let i = 0;
  while (t < SHIFT_MINUTES - 1e-9) {
    const nextEvent = i < events.length ? events[i].s : SHIFT_MINUTES;
    if (t >= nextEvent - 1e-9) {
      const e = events[i++];
      push(e.st, t, e.e, e.reason, 1);
      t = Math.max(t, e.e);
      continue;
    }
    const p = params(m, t, night, yesterdayNight, fixes);
    const len = Math.min(45, Math.max(1.5, -Math.log(1 - rr()) * p.mtbs));
    const end = Math.min(nextEvent, t + len, SHIFT_MINUTES);
    if (rr() < p.slowShare) push('slow', t, end, 'Running slow', p.sf);
    else push('run', t, end, '', 1);
    t = end;
    if (t < nextEvent - 1e-9 && t < SHIFT_MINUTES) {
      const dd = p.stopMin + rr() * (p.stopMax - p.stopMin);
      const e = Math.min(t + dd, nextEvent, SHIFT_MINUTES);
      push('stop', t, e, 'Short stops', 1);
      t = e;
    }
  }
  return segs;
}

/* ------------------------------------------------------------------ */
/* statistics                                                          */
/* ------------------------------------------------------------------ */

export type Stats = {
  /** Units the machine should have made in this window. */
  target: number;
  /** Units it actually made, good and bad together. */
  gross: number;
  /** Units rejected. */
  rej: number;
  /** Good units. gross minus rejects. */
  good: number;
  /** Units lost against target. */
  lost: number;
  /** Lost units split by cause. */
  L: { stop: number; slow: number; co: number; rej: number };
  /** Minutes in each state. */
  min: { run: number; slow: number; stop: number; co: number; idle: number };
  /** Downtime minutes by cause, changeover included. */
  dt: Record<string, number>;
  /** Number of stop events that began in this window. */
  stopN: number;
  /** How many of those were short stops. */
  shortN: number;
};

export function blankStats(): Stats {
  return {
    target: 0,
    gross: 0,
    rej: 0,
    good: 0,
    lost: 0,
    L: { stop: 0, slow: 0, co: 0, rej: 0 },
    min: { run: 0, slow: 0, stop: 0, co: 0, idle: 0 },
    dt: {},
    stopN: 0,
    shortN: 0,
  };
}

export function addStats(into: Stats, s: Stats): void {
  into.target += s.target;
  into.gross += s.gross;
  into.rej += s.rej;
  into.good += s.good;
  into.lost += s.lost;
  into.stopN += s.stopN;
  into.shortN += s.shortN;
  (['stop', 'slow', 'co', 'rej'] as const).forEach((k) => {
    into.L[k] += s.L[k];
  });
  (['run', 'slow', 'stop', 'co', 'idle'] as const).forEach((k) => {
    into.min[k] += s.min[k];
  });
  for (const r in s.dt) into.dt[r] = (into.dt[r] || 0) + s.dt[r];
}

/** Roll a segment list up into numbers, over the shift window [a, b]. */
export function statsFor(
  mi: number,
  segs: Segment[],
  a: number,
  b: number,
  fixRejectsAt?: number | null
): Stats {
  const m = MACHINES[mi];
  const o = blankStats();
  let slowLoss = 0;

  for (const g of segs) {
    if (g.e <= a) continue;
    if (g.s >= b) break;
    const s = Math.max(a, g.s);
    const e = Math.min(b, g.e);
    const d = e - s;
    o.min[g.st] += d;

    if (g.st === 'run' || g.st === 'slow') {
      const gr = d * RATE_PER_MIN * g.sf;
      o.gross += gr;
      o.rej += gr * rejectRate(m, s, e, fixRejectsAt);
      if (g.st === 'slow') slowLoss += d * RATE_PER_MIN * (1 - g.sf);
    } else if (g.st === 'stop') {
      o.dt[g.reason] = (o.dt[g.reason] || 0) + d;
      if (g.s >= a) {
        o.stopN++;
        if (g.reason === 'Short stops') o.shortN++;
      }
    } else if (g.st === 'co') {
      o.dt['Setup/changeover'] = (o.dt['Setup/changeover'] || 0) + d;
    }
  }

  o.target = Math.max(0, b - a - o.min.idle) * RATE_PER_MIN;
  o.good = o.gross - o.rej;
  o.L = {
    stop: o.min.stop * RATE_PER_MIN,
    slow: slowLoss,
    co: o.min.co * RATE_PER_MIN,
    rej: o.rej,
  };
  o.lost = o.L.stop + o.L.slow + o.L.co + o.L.rej;
  return o;
}

/** The segment a machine is in at shift minute `tm`. */
export function currentSegment(segs: Segment[], tm: number): Segment {
  for (const g of segs) if (tm >= g.s && tm < g.e) return g;
  return segs[segs.length - 1];
}

/**
 * Downtime events for one machine-shift, as the log shows them.
 * Short stops are grouped into one row per hour, because a log of 60 one-minute
 * stops helps nobody.
 */
export type DowntimeRow = {
  mi: number;
  machineId: string;
  /** Shift minute the event started. */
  s: number;
  e: number;
  durationMin: number;
  occurrences: number;
  cause: string;
  ongoing: boolean;
};

export function downtimeRows(
  mi: number,
  segs: Segment[],
  upTo: number,
  isLive: boolean
): DowntimeRow[] {
  const out: DowntimeRow[] = [];
  const groups: Record<number, DowntimeRow> = {};
  const machineId = MACHINES[mi].id;

  for (const g of segs) {
    if (g.s >= upTo) break;
    if (g.st !== 'stop' && g.st !== 'co') continue;
    const e = Math.min(g.e, upTo);
    const cause = g.st === 'co' ? 'Setup/changeover' : g.reason;

    if (cause === 'Short stops') {
      const h = Math.floor(g.s / 60);
      const gr =
        groups[h] ||
        (groups[h] = {
          mi,
          machineId,
          s: g.s,
          e,
          durationMin: 0,
          occurrences: 0,
          cause,
          ongoing: false,
        });
      gr.durationMin += e - g.s;
      gr.occurrences++;
      gr.e = Math.max(gr.e, e);
      if (isLive && g.e > upTo) gr.ongoing = true;
    } else {
      out.push({
        mi,
        machineId,
        s: g.s,
        e,
        durationMin: e - g.s,
        occurrences: 1,
        cause,
        ongoing: isLive && g.e > upTo,
      });
    }
  }
  for (const h in groups) out.push(groups[h]);
  out.sort((a, b) => a.s - b.s);
  return out;
}

export { MACHINES, MACHINE_INDEX, LINE_C_IDS };
