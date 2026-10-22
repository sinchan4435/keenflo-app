'use client';

import React, { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

import TopBar from '@/components/TopBar';
import { C, CARD_SHADOW, ErrorCard, Loading, Pill, Select, card, h2, sub } from '@/components/ui';
import { startMinuteOf } from '@/lib/analytics';
import {
  DOWNTIME_CAUSES,
  RATE_PER_MIN,
  SHIFTS,
  SHIFT_ORDER,
  ShiftCode,
} from '@/lib/config';
import { dur, fmt, hm } from '@/lib/format';
import { MACHINES, MACHINE_INDEX } from '@/lib/plant';
import { downtimeRows } from '@/lib/sim-core';
import { DowntimeStatus } from '@/lib/types';
import { labelOf, useKeenFlo } from '@/lib/use-keenflo';

type ShiftFilter = ShiftCode | 'all';

const STATUS_STYLE: Record<DowntimeStatus, { label: string; c: string; tint: string }> = {
  open: { label: 'Open', c: C.red, tint: 'rgba(229, 62, 62, 0.12)' },
  acknowledged: { label: 'Acknowledged', c: C.amber, tint: 'rgba(237, 137, 54, 0.16)' },
  resolved: { label: 'Resolved', c: C.green, tint: 'rgba(72, 187, 120, 0.14)' },
};

const SHIFT_OPTIONS: [ShiftFilter, string][] = [
  ['all', 'All shifts'],
  ['A', 'Shift A'],
  ['B', 'Shift B'],
  ['C', 'Shift C'],
];

type LogRow = {
  key: string;
  dbId: string | null;
  when: string;
  sortAt: number;
  machineId: string;
  operator: string;
  dur: string;
  cause: string;
  shiftName: string;
  status: DowntimeStatus;
  live: boolean;
};

export default function DowntimePage() {
  const kf = useKeenFlo();
  const {
    loading,
    error,
    reload,
    range,
    rangeText,
    scopeKeys,
    index,
    dateFor,
    offsetOf,
    tm,
    liveSegments,
    acknowledgeDowntime,
  } = kf;

  const [machine, setMachine] = useState('all');
  const [cause, setCause] = useState('all');
  const [shift, setShift] = useState<ShiftFilter>('all');
  const [heatShift, setHeatShift] = useState<ShiftCode>('C');
  const [limit, setLimit] = useState(12);

  const view = useMemo(() => {
    if (loading || error || !kf.data) return null;

    const shifts: ShiftCode[] = shift === 'all' ? SHIFT_ORDER : [shift];
    const scopes = scopeKeys(range, shifts);
    const onlyMachine = machine === 'all' ? null : machine;

    const operatorName = (machineId: string, sh: ShiftCode) =>
      MACHINES[MACHINE_INDEX[machineId]].ops[sh];

    /* ---- Pareto: minutes by cause ---- */
    const minutes: Record<string, number> = {};
    DOWNTIME_CAUSES.forEach((c) => {
      minutes[c] = 0;
    });

    const log: LogRow[] = [];

    for (const sc of scopes) {
      if (sc.kind === 'live') {
        MACHINES.forEach((m, mi) => {
          if (onlyMachine && m.id !== onlyMachine) return;
          for (const ev of downtimeRows(mi, liveSegments[mi], tm, true)) {
            if (minutes[ev.cause] != null) minutes[ev.cause] += ev.durationMin;
            const resolvedYet = tm - ev.e >= 25;
            log.push({
              key: `live-${m.id}-${ev.cause}-${ev.s.toFixed(2)}`,
              dbId: null,
              when: `Today · ${hm(ev.s)}`,
              sortAt: 1_000_000 + ev.s,
              machineId: m.id,
              operator: m.ops.C,
              dur: dur(Math.max(1, ev.durationMin)) + (ev.ongoing ? ' so far' : ''),
              cause:
                ev.cause === 'Short stops' ? `Short stops × ${ev.occurrences}` : ev.cause,
              shiftName: SHIFTS.C.name,
              status: ev.ongoing ? 'open' : resolvedYet ? 'resolved' : 'acknowledged',
              live: true,
            });
          }
        });
        continue;
      }

      const offset = offsetOf(sc.date);
      MACHINES.forEach((m) => {
        if (onlyMachine && m.id !== onlyMachine) return;
        const rows = index.downtime.get(`${sc.date}|${sc.shift}|${m.id}`) ?? [];
        for (const e of rows) {
          const mins = Number(e.duration_min);
          if (minutes[e.cause] != null) minutes[e.cause] += mins;
          const start = startMinuteOf(e);
          log.push({
            key: e.id,
            dbId: e.id,
            when: `${offset === 0 ? 'Today' : labelOf(sc.date, true)} · ${hm(start, sc.shift)}`,
            sortAt: offset * 1440 + SHIFTS[sc.shift].start * 60 + start,
            machineId: m.id,
            operator: operatorName(m.id, sc.shift),
            dur: dur(Math.max(1, mins)),
            cause: e.cause === 'Short stops' ? `Short stops × ${e.occurrences}` : e.cause,
            shiftName: SHIFTS[sc.shift].name,
            status: e.status,
            live: false,
          });
        }
      });
    }

    const list = DOWNTIME_CAUSES.map((c) => ({ c, v: minutes[c] })).sort((a, b) => b.v - a.v);
    const total = list.reduce((a, b) => a + b.v, 0);
    let cumulative = 0;
    const bars = list.map((x) => {
      cumulative += x.v;
      return {
        label: x.c,
        short: x.c.replace('Setup/changeover', 'Changeover'),
        minutes: Math.round(x.v),
        cumPct: total > 0 ? (cumulative / total) * 100 : 0,
      };
    });
    const top2 =
      total > 0 ? Math.round(((list[0].v + list[1].v) / total) * 100) : 0;
    const paretoNote =
      total > 0
        ? `${list[0].c} and ${list[1].c.toLowerCase()} make up ${top2}% of all downtime.`
        : 'No downtime in this range.';
    const maxMinutes = Math.max(1, ...bars.map((b) => b.minutes));

    /* ---- log ---- */
    const filteredLog = (cause === 'all' ? log : log.filter((l) => l.cause.startsWith(cause)))
      .slice()
      .sort((a, b) => b.sortAt - a.sortAt);

    /* ---- heatmap: minutes stopped per machine per hour ---- */
    const heatScopes = scopeKeys(range, [heatShift]);
    const instances = Math.max(1, heatScopes.length);
    const heat = MACHINES.map((m, mi) => {
      const cells: { v: number; label: string; bg: string; fg: string; tip: string }[] = [];
      for (let h = 0; h < 8; h++) {
        let v = 0;
        for (const sc of heatScopes) {
          const a = h * 60;
          if (sc.kind === 'live') {
            const b = Math.min(tm, a + 60);
            if (b <= a) continue;
            for (const g of liveSegments[mi]) {
              if (g.e <= a) continue;
              if (g.s >= b) break;
              if (g.st === 'stop') v += Math.min(b, g.e) - Math.max(a, g.s);
            }
          } else {
            const row = (index.hourly.get(`${sc.date}|${sc.shift}|${m.id}`) ?? []).find(
              (r) => r.hour === h
            );
            if (row) v += Number(row.stopped_min);
          }
        }
        v /= instances;
        const alpha = Math.min(1, v / 20);
        cells.push({
          v,
          label: v >= 1 ? String(Math.round(v)) : '',
          bg: v < 0.5 ? '#F7FAFC' : `rgba(229, 62, 62, ${(0.1 + alpha * 0.85).toFixed(2)})`,
          fg: alpha > 0.45 ? C.white : C.ink,
          tip: `${m.id} ${hm(h * 60, heatShift)}: ${Math.round(v)} min stopped`,
        });
      }
      return {
        id: m.id,
        cells,
        dim: onlyMachine && m.id !== onlyMachine ? 0.35 : 1,
      };
    });

    const hCols = [0, 1, 2, 3, 4, 5, 6, 7].map((h) => hm(h * 60, heatShift).slice(0, 2));

    return {
      bars,
      maxMinutes,
      paretoNote,
      total: dur(total),
      totalUnits: fmt(total * RATE_PER_MIN),
      log: filteredLog,
      logCount: `${filteredLog.length} events`,
      heat,
      hCols,
      heatNote:
        instances > 1
          ? `Average minutes stopped per hour, across ${instances} ${SHIFTS[
              heatShift
            ].label.toLowerCase()} shifts`
          : 'Minutes stopped per hour',
      scope: rangeText(range).scope,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loading,
    error,
    kf.data,
    index,
    range,
    shift,
    machine,
    cause,
    heatShift,
    tm,
    liveSegments,
    dateFor,
  ]);

  if (error) {
    return (
      <>
        <TopBar title="Downtime" />
        <ErrorCard title="KeenFlo could not load the downtime log" message={error} onRetry={reload} />
      </>
    );
  }
  if (!view) {
    return (
      <>
        <TopBar title="Downtime" />
        <Loading what="the downtime log" />
      </>
    );
  }

  const th: React.CSSProperties = { padding: '10px 12px', borderBottom: `1px solid ${C.line}` };
  const td: React.CSSProperties = { padding: '11px 12px', borderBottom: `1px solid ${C.hair}` };
  const shown = view.log.slice(0, limit);

  return (
    <>
      <TopBar title="Downtime" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section
          aria-label="Filters"
          style={{
            background: C.white,
            borderRadius: 15,
            boxShadow: CARD_SHADOW,
            padding: '16px 22px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: '14px 20px',
          }}
        >
          <Select
            label="Machine"
            value={machine}
            onChange={(v) => {
              setMachine(v);
              setLimit(12);
            }}
            minWidth={200}
            options={[
              { v: 'all', l: 'All machines' },
              ...MACHINES.map((m) => ({ v: m.id, l: `${m.id} · ${m.type}` })),
            ]}
          />
          <Select
            label="Cause"
            value={cause}
            onChange={(v) => {
              setCause(v);
              setLimit(12);
            }}
            minWidth={200}
            options={[
              { v: 'all', l: 'All causes' },
              ...DOWNTIME_CAUSES.map((c) => ({ v: c, l: c })),
            ]}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.faint }}>Shift</span>
            <div role="group" aria-label="Shift" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SHIFT_OPTIONS.map(([k, l]) => (
                <Pill
                  key={k}
                  label={l}
                  on={shift === k}
                  onClick={() => {
                    setShift(k);
                    setLimit(12);
                  }}
                />
              ))}
            </div>
          </div>
          <span
            style={{ fontSize: 12, color: C.muted, paddingBottom: 10 }}
            suppressHydrationWarning
          >
            {view.scope} · {view.total} of downtime ({view.totalUnits} units)
          </span>
        </section>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 24 }}>
          {/* Pareto */}
          <section
            aria-labelledby="par-h"
            style={{ ...card, flex: '7 1 520px', minWidth: 0, gap: 14 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id="par-h" style={h2}>
                Downtime by cause
              </h2>
              <span style={sub}>
                Minutes stopped, biggest first. The line shows the running total.
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                fontSize: 12,
                color: C.muted,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  aria-hidden="true"
                  style={{ width: 12, height: 12, borderRadius: 3, background: C.teal }}
                />
                Minutes
              </span>
              <span
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}
              >
                <span aria-hidden="true" style={{ width: 16, height: 2, background: C.ink }} />
                Running total %
              </span>
            </div>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={view.bars} margin={{ top: 16, right: 8, bottom: 8, left: -12 }}>
                  <CartesianGrid stroke={C.line} strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="short"
                    tick={{ fontSize: 10, fill: C.slate }}
                    axisLine={{ stroke: C.line }}
                    tickLine={false}
                    interval={0}
                    height={48}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis
                    yAxisId="left"
                    domain={[0, Math.ceil(view.maxMinutes * 1.2)]}
                    tick={{ fontSize: 11, fill: C.faint }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    ticks={[0, 50, 100]}
                    tickFormatter={(v: number) => v + '%'}
                    tick={{ fontSize: 11, fill: C.faint }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="minutes"
                    fill={C.teal}
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="right"
                    type="linear"
                    dataKey="cumPct"
                    stroke={C.ink}
                    strokeWidth={2}
                    dot={{ r: 4, fill: C.ink }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                background: C.page,
                borderRadius: 12,
                padding: '12px 14px',
              }}
              suppressHydrationWarning
            >
              {view.paretoNote}
            </p>
          </section>

          {/* heatmap */}
          <section
            aria-labelledby="heat-h"
            style={{ ...card, flex: '5 1 380px', minWidth: 0, gap: 12 }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 id="heat-h" style={h2}>
                  Downtime by hour
                </h2>
                <span style={{ fontSize: 12, color: C.muted }}>{view.heatNote}</span>
              </div>
              <div role="group" aria-label="Shift for heatmap" style={{ display: 'flex', gap: 4 }}>
                {SHIFT_ORDER.map((k) => (
                  <Pill
                    key={k}
                    label={SHIFTS[k].name}
                    on={heatShift === k}
                    onClick={() => setHeatShift(k)}
                  />
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '46px repeat(8, minmax(0, 1fr))',
                gap: 3,
                fontSize: 10,
                color: C.faint,
                fontWeight: 700,
              }}
            >
              <span />
              {view.hCols.map((hc, i) => (
                <span key={i} style={{ textAlign: 'center' }}>
                  {hc}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {view.heat.map((hr) => (
                <div
                  key={hr.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '46px repeat(8, minmax(0, 1fr))',
                    gap: 3,
                    opacity: hr.dim,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, lineHeight: '20px' }}>
                    {hr.id}
                  </span>
                  {hr.cells.map((ce, i) => (
                    <span
                      key={i}
                      title={ce.tip}
                      suppressHydrationWarning
                      style={{
                        height: 20,
                        borderRadius: 4,
                        background: ce.bg,
                        color: ce.fg,
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {ce.label}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: C.muted,
              }}
            >
              <span>0 min</span>
              {['#F7FAFC', 'rgba(229, 62, 62, 0.3)', 'rgba(229, 62, 62, 0.6)', 'rgba(229, 62, 62, 0.95)'].map(
                (bg) => (
                  <span
                    key={bg}
                    aria-hidden="true"
                    style={{
                      width: 18,
                      height: 10,
                      borderRadius: 3,
                      background: bg,
                      border: bg === '#F7FAFC' ? `1px solid ${C.hair}` : undefined,
                    }}
                  />
                )
              )}
              <span>20+ min stopped in the hour</span>
            </div>
          </section>
        </div>

        {/* log */}
        <section aria-labelledby="log-h" style={{ ...card, gap: 14 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <h2 id="log-h" style={h2}>
              Downtime log
            </h2>
            <span style={sub} suppressHydrationWarning>
              {view.logCount}, newest first. Short stops are grouped by machine and hour.
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse', fontSize: 13 }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: 'left',
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.faint,
                    letterSpacing: '0.04em',
                  }}
                >
                  <th scope="col" style={{ ...th, padding: '10px 12px 10px 0' }}>
                    START
                  </th>
                  <th scope="col" style={th}>
                    MACHINE
                  </th>
                  <th scope="col" style={th}>
                    OPERATOR
                  </th>
                  <th scope="col" style={th}>
                    DURATION
                  </th>
                  <th scope="col" style={th}>
                    CAUSE
                  </th>
                  <th scope="col" style={th}>
                    SHIFT
                  </th>
                  <th scope="col" style={{ ...th, padding: '10px 0 10px 12px' }}>
                    STATUS
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((lg) => {
                  const st = STATUS_STYLE[lg.status];
                  return (
                    <tr key={lg.key}>
                      <td
                        style={{
                          ...td,
                          padding: '11px 12px 11px 0',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lg.when}
                      </td>
                      <td style={{ ...td, fontWeight: 700 }}>{lg.machineId}</td>
                      <td style={td}>{lg.operator}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{lg.dur}</td>
                      <td style={td}>
                        {lg.cause}
                        {lg.live ? (
                          <span
                            style={{
                              marginLeft: 8,
                              padding: '2px 7px',
                              borderRadius: 999,
                              background: 'rgba(79, 209, 197, 0.18)',
                              color: C.tealDark,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            live
                          </span>
                        ) : null}
                      </td>
                      <td style={{ ...td, color: C.muted }}>{lg.shiftName}</td>
                      <td style={{ ...td, padding: '11px 0 11px 12px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 999,
                              background: st.tint,
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: st.c,
                              }}
                            />
                            {st.label}
                          </span>
                          {lg.dbId && lg.status === 'open' ? (
                            <button
                              type="button"
                              onClick={() => acknowledgeDowntime(lg.dbId as string)}
                              style={{
                                font: 'inherit',
                                border: `1px solid ${C.line}`,
                                borderRadius: 10,
                                padding: '4px 10px',
                                background: C.white,
                                color: C.ink,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Acknowledge
                            </button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {view.log.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: C.muted }}>
              No downtime matches these filters.
            </p>
          ) : null}

          {view.log.length > limit ? (
            <button
              type="button"
              onClick={() => setLimit(limit + 12)}
              style={{
                font: 'inherit',
                alignSelf: 'flex-start',
                border: 0,
                borderRadius: 12,
                padding: '10px 16px',
                background: C.hair,
                color: C.ink,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Show more ({view.log.length - limit} left)
            </button>
          ) : null}
        </section>
      </div>
    </>
  );
}
