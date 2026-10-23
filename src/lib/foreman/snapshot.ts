/**
 * The live shift, squeezed into compact JSON for Foreman.
 *
 * The current night shift only exists in the browser's simulator, so the client
 * has to hand it to the server with each question.
 */
import { problemLoss, topIssue } from '@/lib/analytics';
import { CAUSES, RUPEES_PER_UNIT, SHIFTS, STATE_STYLE } from '@/lib/config';
import { clock, hm } from '@/lib/format';
import { LINE_C_IDS, MACHINES } from '@/lib/plant';
import { Segment, Stats, currentSegment } from '@/lib/sim-core';
import { ActionItemRow } from '@/lib/types';

export type LiveSnapshot = {
  clock: string;
  shift: string;
  minutesIntoShift: number;
  plant: {
    target: number;
    produced: number;
    unitsLost: number;
    rupeesLost: number;
    efficiencyPct: number;
    machinesRunning: number;
    machinesStopped: number;
  };
  machines: {
    id: string;
    line: string;
    type: string;
    operator: string;
    status: string;
    efficiencyPct: number | null;
    unitsLost: number;
    topIssue: string;
  }[];
  lossByCause: { cause: string; units: number; rupees: number; sharePct: number }[];
  findings: string[];
};

const round = (n: number) => Math.round(n);

/** Build the snapshot from whatever the simulator is showing right now. */
export function buildLiveSnapshot(args: {
  tm: number;
  tSeconds: number;
  segments: Segment[][];
  perMachine: Stats[];
  total: Stats;
  openActions: ActionItemRow[];
}): LiveSnapshot {
  const { tm, tSeconds, segments, perMachine, total, openActions } = args;

  const counts: Record<string, number> = { run: 0, slow: 0, co: 0, stop: 0, idle: 0 };
  const machines = MACHINES.map((m, mi) => {
    const now = currentSegment(segments[mi], tm);
    counts[now.st]++;
    const s = perMachine[mi];
    return {
      id: m.id,
      line: `Line ${m.line}`,
      type: m.type,
      operator: m.ops.C,
      status: STATE_STYLE[now.st].word,
      efficiencyPct: s.target > 0 ? Number(((s.good / s.target) * 100).toFixed(1)) : null,
      unitsLost: round(s.lost),
      topIssue: topIssue(s).label,
    };
  });

  const lossByCause = CAUSES.map((c) => ({
    cause: c.label,
    units: round(total.L[c.key]),
    rupees: round(total.L[c.key] * RUPEES_PER_UNIT),
    sharePct: total.lost > 0 ? Math.round((total.L[c.key] / total.lost) * 100) : 0,
  })).sort((a, b) => b.units - a.units);

  // One plain sentence per open problem, ranked by what it is costing tonight.
  const findings = openActions
    .map((it) => ({ it, loss: problemLoss(it.id, perMachine, LINE_C_IDS) }))
    .sort((a, b) => b.loss - a.loss)
    .map(
      ({ it, loss }) =>
        `${it.who}: ${it.title}. Lost ₹${round(loss * RUPEES_PER_UNIT).toLocaleString(
          'en-IN'
        )} so far this shift.`
    );

  return {
    clock: clock(tSeconds),
    shift: `Shift C (Night, ${SHIFTS.C.range})`,
    minutesIntoShift: round(tm),
    plant: {
      target: round(total.target),
      produced: round(total.good),
      unitsLost: round(total.lost),
      rupeesLost: round(total.lost * RUPEES_PER_UNIT),
      efficiencyPct:
        total.target > 0 ? Number(((total.good / total.target) * 100).toFixed(1)) : 0,
      machinesRunning: counts.run,
      machinesStopped: counts.stop,
    },
    machines,
    lossByCause,
    findings,
  };
}

/** Render the snapshot as the compact text the model actually reads. */
export function snapshotToText(s: LiveSnapshot): string {
  const money = (n: number) => '₹' + n.toLocaleString('en-IN');
  const lines: string[] = [];

  lines.push(
    `${s.shift}, now ${s.clock} (${s.minutesIntoShift} min into the shift, ends at ${hm(480)}).`
  );
  lines.push(
    `Plant so far: produced ${s.plant.produced.toLocaleString('en-IN')} of a ` +
      `${s.plant.target.toLocaleString('en-IN')} target = ${s.plant.efficiencyPct}% efficiency. ` +
      `Lost ${s.plant.unitsLost.toLocaleString('en-IN')} units (${money(s.plant.rupeesLost)}). ` +
      `${s.plant.machinesRunning} machines running, ${s.plant.machinesStopped} stopped.`
  );

  lines.push('');
  lines.push('Lost output by cause this shift:');
  for (const c of s.lossByCause) {
    lines.push(
      `- ${c.cause}: ${c.units.toLocaleString('en-IN')} units, ${money(c.rupees)} (${c.sharePct}%)`
    );
  }

  lines.push('');
  lines.push('Every machine right now (id | line | type | operator | status | efficiency | units lost | top issue):');
  for (const m of s.machines) {
    lines.push(
      `- ${m.id} | ${m.line} | ${m.type} | ${m.operator} | ${m.status} | ` +
        `${m.efficiencyPct == null ? 'not scheduled' : m.efficiencyPct + '%'} | ` +
        `${m.unitsLost.toLocaleString('en-IN')} | ${m.topIssue}`
    );
  }

  if (s.findings.length) {
    lines.push('');
    lines.push('Open problems costing money tonight, worst first:');
    s.findings.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  }

  return lines.join('\n');
}
