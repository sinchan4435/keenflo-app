/**
 * Seed the KeenFlo Supabase project.
 *
 *   npm run seed
 *
 * Deterministic: the same run always writes the same numbers.
 * Idempotent: it clears every table first, so running it twice is safe.
 *
 * This is the ONLY file that touches SUPABASE_SERVICE_ROLE_KEY.
 */
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

import {
  CAUSES,
  HISTORY_DAYS,
  RATE_PER_MIN,
  RUPEES_PER_UNIT,
  SHIFT_MINUTES,
  SHIFT_ORDER,
  ShiftCode,
} from '../src/lib/config';
import { LINES, MACHINES, MACHINE_INDEX, LINE_C_IDS, initials, operatorId, operatorRole } from '../src/lib/plant';
import { Segment, Stats, buildShift, downtimeRows, statsFor } from '../src/lib/sim-core';
import { addDays, dayLabelFromIso, istToday, shiftStartAt } from '../src/lib/dates';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.\n' +
      'Copy .env.example to .env.local and fill in your Supabase project keys.'
  );
  process.exit(1);
}

const db = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TODAY = istToday();
/** Day 0 is today. Shift C of today is simulated live in the browser. */
const DAYS: number[] = [];
for (let d = -HISTORY_DAYS; d <= 0; d++) DAYS.push(d);

const shiftsForDay = (d: number): ShiftCode[] => (d === 0 ? ['A', 'B'] : SHIFT_ORDER);

/* ------------------------------------------------------------------ */
/* build every shift once, and keep it                                 */
/* ------------------------------------------------------------------ */

type ShiftKey = string; // `${d}|${shift}`
const SEGMENTS = new Map<ShiftKey, Segment[][]>();
const FULL = new Map<ShiftKey, Stats[]>();

function key(d: number, sh: ShiftCode): ShiftKey {
  return `${d}|${sh}`;
}

for (const d of DAYS) {
  for (const sh of shiftsForDay(d)) {
    const segs = MACHINES.map((_, mi) => buildShift(mi, d, sh, null));
    SEGMENTS.set(key(d, sh), segs);
    FULL.set(
      key(d, sh),
      segs.map((sg, mi) => statsFor(mi, sg, 0, SHIFT_MINUTES, null))
    );
  }
}

/* ------------------------------------------------------------------ */
/* rows                                                                */
/* ------------------------------------------------------------------ */

const lineRows = LINES.map((l) => ({ id: l.key, name: l.name, process_type: l.desc }));

const machineRows = MACHINES.map((m) => ({
  id: m.id,
  line_id: m.line,
  type: m.type,
  rated_per_hour: m.ratedPerHour,
}));

const operatorRows: {
  id: string;
  name: string;
  role: string;
  avatar_initials: string;
}[] = [];
const assignmentRows: { machine_id: string; operator_id: string; shift: ShiftCode }[] = [];

MACHINES.forEach((m, mi) => {
  for (const sh of SHIFT_ORDER) {
    const id = operatorId(m.id, sh);
    operatorRows.push({
      id,
      name: m.ops[sh],
      role: operatorRole(mi, sh),
      avatar_initials: initials(m.ops[sh]),
    });
    assignmentRows.push({ machine_id: m.id, operator_id: id, shift: sh });
  }
});

type HourlyRow = {
  machine_id: string;
  date: string;
  shift: ShiftCode;
  hour: number;
  target: number;
  produced: number;
  rejects: number;
  stopped_min: number;
  slow_min: number;
  changeover_min: number;
  idle_min: number;
};

type DowntimeInsert = {
  machine_id: string;
  operator_id: string;
  date: string;
  shift: ShiftCode;
  start_at: string;
  duration_min: number;
  cause: string;
  status: 'open' | 'acknowledged' | 'resolved';
  occurrences: number;
};

const hourlyRows: HourlyRow[] = [];
const downtimeInserts: DowntimeInsert[] = [];
const round2 = (n: number) => Math.round(n * 100) / 100;

for (const d of DAYS) {
  const date = addDays(TODAY, d);
  for (const sh of shiftsForDay(d)) {
    const segs = SEGMENTS.get(key(d, sh))!;

    MACHINES.forEach((m, mi) => {
      for (let h = 0; h < 8; h++) {
        const s = statsFor(mi, segs[mi], h * 60, h * 60 + 60, null);
        hourlyRows.push({
          machine_id: m.id,
          date,
          shift: sh,
          hour: h,
          target: Math.round(s.target),
          produced: Math.round(s.gross),
          rejects: Math.round(s.rej),
          stopped_min: round2(s.min.stop),
          slow_min: round2(s.min.slow),
          changeover_min: round2(s.min.co),
          idle_min: round2(s.min.idle),
        });
      }

      for (const ev of downtimeRows(mi, segs[mi], SHIFT_MINUTES, false)) {
        // A few of today's afternoon events are still waiting for a supervisor.
        const stillOpen = d === 0 && sh === 'B' && ev.s >= 360;
        downtimeInserts.push({
          machine_id: m.id,
          operator_id: operatorId(m.id, sh),
          date,
          shift: sh,
          start_at: shiftStartAt(date, sh, ev.s),
          duration_min: round2(Math.max(1, ev.durationMin)),
          cause: ev.cause,
          status: stillOpen ? 'open' : 'resolved',
          occurrences: ev.occurrences,
        });
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* action items: ₹ at stake comes from the history we just built       */
/* ------------------------------------------------------------------ */

function statsOf(mid: string, d: number, sh: ShiftCode): Stats | null {
  const f = FULL.get(key(d, sh));
  return f ? f[MACHINE_INDEX[mid]] : null;
}

/** Units lost per week by one problem, over days -7..-1. */
function itemLossUnits(id: string, d: number, sh: ShiftCode): number {
  const pick = (mid: string) => statsOf(mid, d, sh);
  if (id === 'm07') return (pick('M-07')?.dt['Short stops'] || 0) * RATE_PER_MIN;
  if (id === 'm12') return pick('M-12')?.L.slow || 0;
  if (id === 'linec') return LINE_C_IDS.reduce((s, mid) => s + (pick(mid)?.L.co || 0), 0);
  if (id === 'm18') return pick('M-18')?.L.rej || 0;
  if (id === 'm03') return (pick('M-03')?.dt['Breakdown'] || 0) * RATE_PER_MIN;
  return 0;
}

function weeklyUnits(id: string, from: number, to: number): number {
  let sum = 0;
  for (let d = from; d <= to; d++) for (const sh of SHIFT_ORDER) sum += itemLossUnits(id, d, sh);
  return sum;
}

const weekly: Record<string, number> = {};
for (const id of ['m07', 'm12', 'linec', 'm18']) weekly[id] = weeklyUnits(id, -7, -1);
// M-03 was fixed four days ago, so its weekly cost is what it used to cost.
weekly.m03 = (weeklyUnits('m03', -HISTORY_DAYS, -5) / (HISTORY_DAYS - 4)) * 7;

function severityFor(units: number): string {
  const rupees = units * RUPEES_PER_UNIT;
  if (rupees >= 100_000) return 'Critical';
  if (rupees >= 40_000) return 'High';
  return 'Medium';
}

/* evidence sentences, measured from the seeded history */

// M-07: share of night-shift short stops that land between 02:00 and 04:00.
let m07Window = 0;
let m07Total = 0;
for (let d = -7; d <= -1; d++) {
  for (const g of SEGMENTS.get(key(d, 'C'))![MACHINE_INDEX['M-07']]) {
    if (g.st === 'stop' && g.reason === 'Short stops') {
      const h = Math.min(7, Math.floor(g.s / 60));
      m07Total++;
      if (h === 4 || h === 5) m07Window++;
    }
  }
}
const m07Pct = m07Total ? Math.round((m07Window / m07Total) * 100) : 0;

// Line C: how long mould changes actually take.
let lcCount = 0;
let lcMinutes = 0;
for (let d = -7; d <= -1; d++) {
  for (const sh of SHIFT_ORDER) {
    for (const mid of LINE_C_IDS) {
      for (const g of SEGMENTS.get(key(d, sh))![MACHINE_INDEX[mid]]) {
        if (g.st === 'co') {
          lcCount++;
          lcMinutes += g.e - g.s;
        }
      }
    }
  }
}
const lcAvg = lcCount ? lcMinutes / lcCount : 0;

// M-18: reject rate in the last hour of a shift, averaged over the week.
let m18Gross = 0;
let m18Rej = 0;
for (let d = -7; d <= -1; d++) {
  for (const sh of SHIFT_ORDER) {
    const s = statsFor(MACHINE_INDEX['M-18'], SEGMENTS.get(key(d, sh))![MACHINE_INDEX['M-18']], 420, 480, null);
    m18Gross += s.gross;
    m18Rej += s.rej;
  }
}
const m18Last = m18Gross > 0 ? (m18Rej / m18Gross) * 100 : 0;

const fixDate = addDays(TODAY, -4);

type ActionRow = {
  id: string;
  machine_id: string | null;
  title: string;
  severity: string;
  rupees_per_week: number;
  evidence: string;
  likely_causes: string[];
  fix_steps: string[];
  owner_team: string;
  due_date: string;
  status: 'todo' | 'in_progress' | 'done';
  resolved_at: string | null;
  machines: string[];
  who: string;
  suggested_fix: string;
  opened_on: string;
  started_on: string | null;
  closed_on: string | null;
  support_name: string | null;
  support_where: string | null;
  support_text: string | null;
  sort_order: number;
};

const actionRows: ActionRow[] = [
  {
    id: 'm07',
    machine_id: 'M-07',
    title: 'Reduce short stops on M-07',
    severity: severityFor(weekly.m07),
    rupees_per_week: Math.round(weekly.m07 * RUPEES_PER_UNIT),
    evidence: `Over the last 7 nights, ${m07Pct}% of night-shift stops fell between 02:00 and 04:00.`,
    likely_causes: [
      'Bar feeder jamming as the bar stock runs low',
      'Chips piling up around the feeder and chuck',
      'Coolant flow too weak to wash chips away',
    ],
    fix_steps: [
      'Check and reset the bar feeder alignment.',
      'Clear chips from the feeder channel and chuck area.',
      'Verify coolant flow and nozzle direction.',
      'Retrain the night operator on the feeder reset routine.',
    ],
    owner_team: 'Maintenance',
    due_date: addDays(TODAY, 2),
    status: 'todo',
    resolved_at: null,
    machines: ['M-07'],
    who: 'M-07 · Ravi Kumar',
    suggested_fix: 'Likely bar feeder jamming; check feeder alignment and coolant on chips.',
    opened_on: addDays(TODAY, -2),
    started_on: null,
    closed_on: null,
    support_name: 'Ravi Kumar',
    support_where: 'Night shift · M-07',
    support_text:
      'Night shift on M-07 may need bar feeder reset training. Most stops fall between 02:00 and 04:00.',
    sort_order: 1,
  },
  {
    id: 'm12',
    machine_id: 'M-12',
    title: 'Bring M-12 back to rated speed',
    severity: severityFor(weekly.m12),
    rupees_per_week: Math.round(weekly.m12 * RUPEES_PER_UNIT),
    evidence:
      'Runs at 88% of rated speed whenever it runs, on all three shifts for the last 7 days. Line = rated speed.',
    likely_causes: [
      'Feed or speed override left below 100% on the controller',
      'Program cycle time longer than the approved one',
      'Worn tools forcing slower feeds',
    ],
    fix_steps: [
      'Check the feed and speed override on the controller.',
      'Verify the CNC program cycle time against the approved sheet.',
      'Inspect tool wear and replace worn inserts.',
    ],
    owner_team: 'Production',
    due_date: addDays(TODAY, 4),
    status: 'in_progress',
    resolved_at: null,
    machines: ['M-12'],
    who: 'M-12 · Santosh Patil',
    suggested_fix: 'Check the feed/speed override on the controller and the program cycle time.',
    opened_on: addDays(TODAY, -5),
    started_on: addDays(TODAY, -3),
    closed_on: null,
    support_name: 'All shifts',
    support_where: 'M-12',
    support_text:
      'M-12 runs 12% slow on every shift, so this is a machine setting, not an operator issue. Fix the controller first.',
    sort_order: 2,
  },
  {
    id: 'linec',
    machine_id: null,
    title: 'Halve changeover time on Line C',
    severity: severityFor(weekly.linec),
    rupees_per_week: Math.round(weekly.linec * RUPEES_PER_UNIT),
    evidence: `${lcCount} mould changes in the last 7 days averaged ${Math.round(lcAvg)} min. Line = 30 min standard.`,
    likely_causes: [
      'Moulds and tools fetched only after the machine stops',
      'No standard setup sequence; each setter works differently',
      'Changeover time is not tracked',
    ],
    fix_steps: [
      'Pre-stage moulds, tools and fixtures before the changeover starts.',
      'Use a standard setup checklist (SMED) for every changeover.',
      'Track changeover time per operator and review it weekly.',
    ],
    owner_team: 'Production',
    due_date: addDays(TODAY, 8),
    status: 'todo',
    resolved_at: null,
    machines: [...LINE_C_IDS],
    who: 'Line C · 5 machines',
    suggested_fix: 'Pre-stage moulds and tools before each changeover; use a setup checklist.',
    opened_on: addDays(TODAY, -1),
    started_on: null,
    closed_on: null,
    support_name: 'Line C setters',
    support_where: 'All shifts · Line C',
    support_text:
      'Setters on every shift would benefit from a shared changeover checklist and pre-staged moulds.',
    sort_order: 3,
  },
  {
    id: 'm18',
    machine_id: 'M-18',
    title: 'Stop rejects rising on M-18 after 4 hours',
    severity: severityFor(weekly.m18),
    rupees_per_week: Math.round(weekly.m18 * RUPEES_PER_UNIT),
    evidence: `Rejects stay near 1% for the first 4 hours, then climb to ${m18Last.toFixed(1)}% by the end of the shift (7-day average).`,
    likely_causes: ['Thermal drift as the spindle warms up', 'Tool wear past its useful life'],
    fix_steps: [
      'Schedule a tool change at 3.5 hours of running.',
      'Add an in-process gauge check every hour after hour 3.',
      'Log hourly measurements for a week to confirm the drift.',
    ],
    owner_team: 'Quality',
    due_date: addDays(TODAY, 3),
    status: 'todo',
    resolved_at: null,
    machines: ['M-18'],
    who: 'M-18 · Arjun Rao',
    suggested_fix: 'Schedule a tool change at 3.5 hours and add an in-process gauge check.',
    opened_on: addDays(TODAY, -1),
    started_on: null,
    closed_on: null,
    support_name: 'Arjun Rao',
    support_where: 'Night shift · M-18',
    support_text: 'An hourly gauge check after hour 3 would catch drift before parts are rejected.',
    sort_order: 4,
  },
  {
    id: 'm03',
    machine_id: 'M-03',
    title: 'Fix coolant pump trips on M-03',
    severity: severityFor(weekly.m03),
    rupees_per_week: Math.round(weekly.m03 * RUPEES_PER_UNIT),
    evidence: `Breakdown minutes per day. No coolant pump trips since the fix on ${dayLabelFromIso(fixDate)}.`,
    likely_causes: ['Coolant pump overload relay tripping', 'Clogged suction strainer'],
    fix_steps: [
      'Clean the coolant tank and suction strainer.',
      'Replace the pump overload relay.',
      'Add the strainer to the weekly checklist.',
    ],
    owner_team: 'Maintenance',
    due_date: addDays(TODAY, -4),
    status: 'done',
    resolved_at: shiftStartAt(fixDate, 'A', 180),
    machines: ['M-03'],
    who: 'M-03 · Line A',
    suggested_fix: `Pump relay replaced and strainer cleaned on ${dayLabelFromIso(fixDate)}.`,
    opened_on: addDays(TODAY, -7),
    started_on: null,
    closed_on: fixDate,
    support_name: null,
    support_where: null,
    support_text: null,
    sort_order: 5,
  },
];

/* ------------------------------------------------------------------ */
/* write                                                               */
/* ------------------------------------------------------------------ */

async function clearAll() {
  // Order matters: children first.
  const tables = [
    'action_items',
    'downtime_events',
    'hourly_output',
    'shift_assignments',
    'operators',
    'machines',
    'lines',
  ];
  for (const t of tables) {
    const { error } = await db.from(t).delete().not('id', 'is', null);
    // shift_assignments has no id column, so fall back to a match-all filter.
    if (error && error.code === '42703') {
      const retry = await db.from(t).delete().in('shift', ['A', 'B', 'C']);
      if (retry.error) throw new Error(`clear ${t}: ${retry.error.message}`);
    } else if (error) {
      throw new Error(`clear ${t}: ${error.message}`);
    }
  }
}

async function insertAll<T extends object>(table: string, rows: T[], chunk = 1000) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from(table).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`insert ${table} [${i}]: ${error.message}`);
  }
}

async function count(table: string): Promise<number> {
  const { count: n, error } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return n ?? 0;
}

async function main() {
  console.log(`KeenFlo seed — plant date ${TODAY} (IST)`);
  console.log(`History: ${DAYS[0]} .. 0, today has shifts A and B (shift C runs live).\n`);

  console.log('Clearing tables…');
  await clearAll();

  console.log('Writing master data…');
  await insertAll('lines', lineRows);
  await insertAll('machines', machineRows);
  await insertAll('operators', operatorRows);
  await insertAll('shift_assignments', assignmentRows);

  console.log(`Writing ${hourlyRows.length} hourly rows…`);
  await insertAll('hourly_output', hourlyRows);

  console.log(`Writing ${downtimeInserts.length} downtime events…`);
  await insertAll('downtime_events', downtimeInserts);

  console.log('Writing action items…');
  await insertAll('action_items', actionRows);

  console.log('\nRow counts');
  console.log('----------');
  for (const t of [
    'lines',
    'machines',
    'operators',
    'shift_assignments',
    'hourly_output',
    'downtime_events',
    'action_items',
  ]) {
    console.log(`${t.padEnd(18)} ${await count(t)}`);
  }

  // A quick sanity read of the planted problems.
  console.log('\nPlanted problems (last 7 days)');
  console.log('------------------------------');
  for (const a of actionRows) {
    console.log(
      `${a.id.padEnd(6)} ${a.severity.padEnd(8)} ₹${a.rupees_per_week.toLocaleString('en-IN')}/week  ${a.title}`
    );
  }

  let good = 0;
  let target = 0;
  for (let d = -7; d <= -1; d++) {
    for (const sh of SHIFT_ORDER) {
      for (const s of FULL.get(key(d, sh))!) {
        good += s.good;
        target += s.target;
      }
    }
  }
  console.log(`\nPlant efficiency over the last 7 days: ${((good / target) * 100).toFixed(1)}%`);

  const yc = FULL.get(key(-1, 'C'))!;
  const yg = yc.reduce((a, s) => a + s.good, 0);
  const yt = yc.reduce((a, s) => a + s.target, 0);
  console.log(`Yesterday night shift:                 ${((yg / yt) * 100).toFixed(1)}%`);
  void CAUSES;
  console.log('\nDone.');
}

main().catch((e) => {
  console.error('\nSeed failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
