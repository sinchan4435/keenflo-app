/**
 * The compact history summary Foreman gets from Supabase.
 *
 * Runs on the server only. It reads with the public anon key, which Row Level
 * Security limits to SELECT, so no privileged key is involved.
 *
 * The result is summarised, never dumped raw: a handful of lines per section,
 * which keeps the whole prompt small.
 */
import { createClient } from '@supabase/supabase-js';

import { buildIndex, statsFromDb, topIssue } from '@/lib/analytics';
import { RUPEES_PER_UNIT, SHIFTS, SHIFT_ORDER, ShiftCode } from '@/lib/config';
import { addDays } from '@/lib/dates';
import { MACHINES } from '@/lib/plant';
import { addStats, blankStats } from '@/lib/sim-core';
import { ActionItemRow, DowntimeRowDb, HourlyRow } from '@/lib/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function label(iso: string, short = false): string {
  const d = new Date(iso + 'T00:00:00Z');
  const w = WEEKDAYS[d.getUTCDay()];
  return short ? `${w} ${d.getUTCDate()}` : `${w} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const money = (units: number) => '₹' + Math.round(units * RUPEES_PER_UNIT).toLocaleString('en-IN');
const num = (n: number) => Math.round(n).toLocaleString('en-IN');

export type HistorySummary = {
  text: string;
  /** Open action items, so the route can mention how many there are. */
  openActionCount: number;
};

/* ------------------------------------------------------------------ */
/* cache                                                               */
/* ------------------------------------------------------------------ */

let cache: { at: number; value: HistorySummary } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------------ */

async function pagedSelect<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/** Build (or reuse) the plant history summary. */
export async function getHistorySummary(): Promise<HistorySummary> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase is not configured on the server.');

  const db = createClient(url, key, { auth: { persistSession: false } });

  // Which day is "today" for this dataset?
  const { data: newest, error: newestErr } = await db
    .from('hourly_output')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);
  if (newestErr) throw new Error(newestErr.message);
  const today: string | undefined = newest?.[0]?.date;
  if (!today) throw new Error('No production history found.');

  const from = addDays(today, -7);

  const [hourly, downtime, actions] = await Promise.all([
    pagedSelect<HourlyRow>((a, b) =>
      db.from('hourly_output').select('*').gte('date', from).lte('date', today).order('id').range(a, b)
    ),
    pagedSelect<DowntimeRowDb>((a, b) =>
      db
        .from('downtime_events')
        .select('*')
        .gte('date', from)
        .lte('date', today)
        .order('start_at')
        .range(a, b)
    ),
    pagedSelect<ActionItemRow>((a, b) =>
      db.from('action_items').select('*').order('sort_order').range(a, b)
    ),
  ]);

  const index = buildIndex(hourly, downtime);
  const lines: string[] = [];

  /* ---------- yesterday, shift by shift ---------- */
  const yesterday = addDays(today, -1);
  lines.push(`Yesterday was ${label(yesterday)}. Shift by shift:`);

  let worstShift: { sh: ShiftCode; eff: number } | null = null;
  for (const sh of SHIFT_ORDER) {
    const totals = blankStats();
    const per = MACHINES.map((m) => {
      const s = statsFromDb(index, yesterday, sh, m.id);
      addStats(totals, s);
      return s;
    });
    const eff = totals.target > 0 ? (totals.good / totals.target) * 100 : 0;

    let wi = 0;
    per.forEach((p, mi) => {
      if (p.lost > per[wi].lost) wi = mi;
    });
    const worstMachine = MACHINES[wi];
    const issue = topIssue(per[wi]);

    lines.push(
      `- ${SHIFTS[sh].name} (${SHIFTS[sh].label}, ${SHIFTS[sh].range}): ${eff.toFixed(1)}% efficiency, ` +
        `produced ${num(totals.good)} of ${num(totals.target)}, lost ${num(totals.lost)} units (${money(
          totals.lost
        )}). Worst machine ${worstMachine.id} (operator ${worstMachine.ops[sh]}), ` +
        `${issue.label.toLowerCase()}, ${num(per[wi].lost)} units lost.`
    );
    if (!worstShift || eff < worstShift.eff) worstShift = { sh, eff };
  }
  if (worstShift) {
    lines.push(
      `The weakest shift yesterday was ${SHIFTS[worstShift.sh].name} (${SHIFTS[
        worstShift.sh
      ].label.toLowerCase()}) at ${worstShift.eff.toFixed(1)}%.`
    );
  }

  /* ---------- plant efficiency, each of the last 7 days ---------- */
  lines.push('');
  lines.push('Plant efficiency, each of the last 7 full days:');
  let weekGood = 0;
  let weekTarget = 0;
  let weekLost = 0;
  for (let d = -7; d <= -1; d++) {
    const date = addDays(today, d);
    const totals = blankStats();
    for (const sh of SHIFT_ORDER) {
      for (const m of MACHINES) addStats(totals, statsFromDb(index, date, sh, m.id));
    }
    weekGood += totals.good;
    weekTarget += totals.target;
    weekLost += totals.lost;
    const eff = totals.target > 0 ? (totals.good / totals.target) * 100 : 0;
    lines.push(
      `- ${label(date)}: ${eff.toFixed(1)}%, lost ${num(totals.lost)} units (${money(totals.lost)})`
    );
  }
  lines.push(
    `Over those 7 days the plant ran at ${((weekGood / weekTarget) * 100).toFixed(1)}% and lost ` +
      `${num(weekLost)} units (${money(weekLost)}).`
  );

  /* ---------- worst machines over the week ---------- */
  const perMachineWeek = MACHINES.map((m) => {
    const totals = blankStats();
    for (let d = -7; d <= -1; d++) {
      const date = addDays(today, d);
      for (const sh of SHIFT_ORDER) addStats(totals, statsFromDb(index, date, sh, m.id));
    }
    return { m, totals, eff: totals.target > 0 ? (totals.good / totals.target) * 100 : 0 };
  });
  const worstMachines = perMachineWeek.slice().sort((a, b) => b.totals.lost - a.totals.lost).slice(0, 5);
  lines.push('');
  lines.push('Machines that lost the most over the last 7 days:');
  for (const w of worstMachines) {
    lines.push(
      `- ${w.m.id} (Line ${w.m.line}, ${w.m.type}): ${w.eff.toFixed(1)}% efficiency, lost ` +
        `${num(w.totals.lost)} units (${money(w.totals.lost)}), mainly ${topIssue(
          w.totals
        ).label.toLowerCase()}.`
    );
  }

  /* ---------- top downtime causes over the week ---------- */
  const causeMinutes = new Map<string, number>();
  let totalMinutes = 0;
  for (const e of downtime) {
    if (e.date < addDays(today, -7) || e.date > addDays(today, -1)) continue;
    const mins = Number(e.duration_min);
    causeMinutes.set(e.cause, (causeMinutes.get(e.cause) ?? 0) + mins);
    totalMinutes += mins;
  }
  const causes = Array.from(causeMinutes.entries()).sort((a, b) => b[1] - a[1]);
  lines.push('');
  lines.push('Downtime causes over the last 7 days, biggest first:');
  for (const [cause, mins] of causes) {
    const share = totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0;
    lines.push(`- ${cause}: ${Math.round(mins).toLocaleString('en-IN')} minutes (${share}%)`);
  }

  /* ---------- operators ---------- */
  lines.push('');
  lines.push('Operators by machine and shift (Shift A / Shift B / Shift C):');
  for (const m of MACHINES) {
    lines.push(`- ${m.id}: ${m.ops.A} / ${m.ops.B} / ${m.ops.C}`);
  }

  /* ---------- action items ---------- */
  const open = actions.filter((a) => a.status !== 'done');
  lines.push('');
  lines.push('Action items:');
  for (const a of actions.slice().sort((x, y) => y.rupees_per_week - x.rupees_per_week)) {
    const status =
      a.status === 'done' ? 'DONE' : a.status === 'in_progress' ? 'IN PROGRESS' : 'TO DO';
    lines.push(
      `- [${status}] ${a.title} (${a.who}, ${a.severity}, owner ${a.owner_team}, due ${
        a.due_date ? label(a.due_date) : 'n/a'
      }). Costs ₹${Math.round(a.rupees_per_week).toLocaleString('en-IN')} per week if unfixed. ` +
        `Evidence: ${a.evidence} Likely causes: ${a.likely_causes.join('; ')}. ` +
        `Fix steps: ${a.fix_steps.map((s, i) => `${i + 1}) ${s}`).join(' ')}`
    );
  }

  const value: HistorySummary = { text: lines.join('\n'), openActionCount: open.length };
  cache = { at: Date.now(), value };
  return value;
}
