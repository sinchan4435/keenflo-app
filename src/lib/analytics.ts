/**
 * Turning rows into numbers.
 *
 * History comes from Supabase (hourly_output + downtime_events). The live
 * shift comes from the simulator. Both end up in the same `Stats` shape, so
 * every screen can mix them without caring where a number came from.
 */
import {
  CAUSES,
  CauseKey,
  RATE_PER_MIN,
  RUPEES_PER_UNIT,
  SHIFT_MINUTES,
  SLOW_FACTOR,
  ShiftCode,
} from './config';
import { MACHINES, MACHINE_INDEX } from './plant';
import { Segment, Stats, addStats, blankStats, statsFor } from './sim-core';
import { DowntimeRowDb, HourlyRow } from './types';

/* ------------------------------------------------------------------ */
/* indexes                                                             */
/* ------------------------------------------------------------------ */

export type PlantIndex = {
  /** `${date}|${shift}|${machineId}` -> hourly rows, ordered by hour. */
  hourly: Map<string, HourlyRow[]>;
  /** `${date}|${shift}|${machineId}` -> downtime events. */
  downtime: Map<string, DowntimeRowDb[]>;
  /** Every date that has hourly data, oldest first. */
  dates: string[];
  /** Dates that have a complete set of three shifts. */
  fullDates: Set<string>;
};

const slot = (date: string, shift: string, machineId: string) =>
  `${date}|${shift}|${machineId}`;

export function buildIndex(hourly: HourlyRow[], downtime: DowntimeRowDb[]): PlantIndex {
  const h = new Map<string, HourlyRow[]>();
  const dates = new Set<string>();
  const shiftsByDate = new Map<string, Set<string>>();

  for (const r of hourly) {
    const k = slot(r.date, r.shift, r.machine_id);
    const list = h.get(k);
    if (list) list.push(r);
    else h.set(k, [r]);
    dates.add(r.date);
    const s = shiftsByDate.get(r.date) ?? new Set<string>();
    s.add(r.shift);
    shiftsByDate.set(r.date, s);
  }
  h.forEach((list) => list.sort((a, b) => a.hour - b.hour));

  const d = new Map<string, DowntimeRowDb[]>();
  for (const r of downtime) {
    const k = slot(r.date, r.shift, r.machine_id);
    const list = d.get(k);
    if (list) list.push(r);
    else d.set(k, [r]);
  }

  const fullDates = new Set<string>();
  shiftsByDate.forEach((s, date) => {
    if (s.size === 3) fullDates.add(date);
  });

  return { hourly: h, downtime: d, dates: Array.from(dates).sort(), fullDates };
}

/* ------------------------------------------------------------------ */
/* stats from the database                                             */
/* ------------------------------------------------------------------ */

/**
 * Rebuild one machine-shift from stored hourly rows.
 * The window is in shift minutes; [0, 480) is the whole shift. A part hour at
 * the end of the window is pro-rated, which is what "so far today" needs.
 */
export function statsFromDb(
  index: PlantIndex,
  date: string,
  shift: ShiftCode,
  machineId: string,
  fromMinute = 0,
  toMinute = SHIFT_MINUTES
): Stats {
  const o = blankStats();
  const rows = index.hourly.get(slot(date, shift, machineId));
  if (!rows) return o;

  for (const r of rows) {
    const a = r.hour * 60;
    const overlap = Math.max(0, Math.min(toMinute, a + 60) - Math.max(fromMinute, a));
    if (overlap <= 0) continue;
    const f = overlap / 60;
    o.target += r.target * f;
    o.gross += r.produced * f;
    o.rej += r.rejects * f;
    o.min.stop += Number(r.stopped_min) * f;
    o.min.slow += Number(r.slow_min) * f;
    o.min.co += Number(r.changeover_min) * f;
    o.min.idle += Number(r.idle_min) * f;
    o.min.run +=
      (60 -
        Number(r.stopped_min) -
        Number(r.slow_min) -
        Number(r.changeover_min) -
        Number(r.idle_min)) *
      f;
  }

  const events = index.downtime.get(slot(date, shift, machineId)) ?? [];
  for (const e of events) {
    const start = startMinuteOf(e);
    if (start >= toMinute || start < fromMinute) continue;
    const clipped = Math.max(0, Math.min(start + Number(e.duration_min), toMinute) - start);
    o.dt[e.cause] = (o.dt[e.cause] || 0) + clipped;
    if (e.cause !== 'Setup/changeover') {
      o.stopN += e.occurrences;
      if (e.cause === 'Short stops') o.shortN += e.occurrences;
    }
  }

  o.good = o.gross - o.rej;
  o.L = {
    stop: o.min.stop * RATE_PER_MIN,
    slow: o.min.slow * RATE_PER_MIN * (1 - SLOW_FACTOR),
    co: o.min.co * RATE_PER_MIN,
    rej: o.rej,
  };
  o.lost = o.L.stop + o.L.slow + o.L.co + o.L.rej;
  return o;
}

/** Minute of the shift a downtime event started at. */
export function startMinuteOf(e: DowntimeRowDb): number {
  const start = Date.parse(e.start_at);
  const shiftStart = Date.parse(shiftStartIso(e.date, e.shift));
  return Math.max(0, Math.round((start - shiftStart) / 60_000));
}

function shiftStartIso(date: string, shift: ShiftCode): string {
  const hour = shift === 'A' ? 6 : shift === 'B' ? 14 : 22;
  return `${date}T${String(hour).padStart(2, '0')}:00:00+05:30`;
}

/* ------------------------------------------------------------------ */
/* scopes                                                             */
/* ------------------------------------------------------------------ */

export type Scope =
  | { kind: 'db'; date: string; shift: ShiftCode; upToMinute?: number }
  | { kind: 'live'; upToMinute: number };

export type Aggregate = {
  total: Stats;
  /** One entry per machine, in MACHINES order. */
  per: Stats[];
};

export type LiveContext = {
  segments: Segment[][];
  /** Shift minute the rejects fix landed at, if any. */
  fixRejAt: number | null;
};

export function aggregate(
  index: PlantIndex,
  scopes: Scope[],
  live: LiveContext,
  fromMinute = 0,
  toMinute = SHIFT_MINUTES
): Aggregate {
  const total = blankStats();
  const per = MACHINES.map(() => blankStats());

  for (const sc of scopes) {
    const end = Math.min(toMinute, sc.upToMinute ?? SHIFT_MINUTES);
    MACHINES.forEach((m, mi) => {
      const s =
        sc.kind === 'live'
          ? statsFor(mi, live.segments[mi], fromMinute, end, live.fixRejAt)
          : statsFromDb(index, sc.date, sc.shift, m.id, fromMinute, end);
      addStats(per[mi], s);
      addStats(total, s);
    });
  }
  return { total, per };
}

/* ------------------------------------------------------------------ */
/* what went wrong                                                     */
/* ------------------------------------------------------------------ */

/** The headline problem for one machine, or "No major issue". */
export function topIssue(s: Stats): { key: CauseKey | null; label: string } {
  if (s.target <= 0) return { key: null, label: 'Not scheduled' };
  let k: CauseKey = 'stop';
  for (const c of ['slow', 'co', 'rej'] as CauseKey[]) if (s.L[c] > s.L[k]) k = c;
  if (s.L[k] < s.target * 0.03) return { key: null, label: 'No major issue' };
  if (k === 'stop') {
    let reason = 'Short stops';
    let most = -1;
    for (const x in s.dt) {
      if (x !== 'Setup/changeover' && s.dt[x] > most) {
        most = s.dt[x];
        reason = x;
      }
    }
    return { key: k, label: reason };
  }
  return {
    key: k,
    label: k === 'slow' ? 'Running slow' : k === 'co' ? 'Changeover' : 'Rejects',
  };
}

export function severityStyle(label: string): { label: string; c: string; tint: string } {
  if (label === 'Critical') return { label, c: '#E53E3E', tint: 'rgba(229, 62, 62, 0.12)' };
  if (label === 'High') return { label, c: '#ED8936', tint: 'rgba(237, 137, 54, 0.16)' };
  return { label, c: '#A0AEC0', tint: 'rgba(203, 213, 224, 0.4)' };
}

export function severityFromRupees(rupees: number): string {
  if (rupees >= 100_000) return 'Critical';
  if (rupees >= 40_000) return 'High';
  return 'Medium';
}

/** Units lost by one planted problem, inside the given stats. */
export function problemLoss(
  itemId: string,
  statsByMachine: Stats[],
  lineCIds: string[]
): number {
  const pick = (mid: string) => statsByMachine[MACHINE_INDEX[mid]];
  if (itemId === 'm07') return (pick('M-07')?.dt['Short stops'] || 0) * RATE_PER_MIN;
  if (itemId === 'm12') return pick('M-12')?.L.slow || 0;
  if (itemId === 'linec') return lineCIds.reduce((s, mid) => s + (pick(mid)?.L.co || 0), 0);
  if (itemId === 'm18') return pick('M-18')?.L.rej || 0;
  if (itemId === 'm03') return (pick('M-03')?.dt['Breakdown'] || 0) * RATE_PER_MIN;
  return 0;
}

export { CAUSES, RUPEES_PER_UNIT, SHIFT_MINUTES };
export type { Stats };
