'use client';

import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';

import TopBar from '@/components/TopBar';
import { C, ErrorCard, Loading, Pill, card, h2, sub } from '@/components/ui';
import { statsFromDb } from '@/lib/analytics';
import { SHIFTS, SHIFT_ORDER, ShiftCode } from '@/lib/config';
import { fmt } from '@/lib/format';
import { MACHINES, operatorId } from '@/lib/plant';
import { useKeenFlo } from '@/lib/use-keenflo';

type ShiftFilter = ShiftCode | 'all';

const SHIFT_OPTIONS: [ShiftFilter, string][] = [
  ['C', 'Shift C · Night'],
  ['A', 'Shift A'],
  ['B', 'Shift B'],
  ['all', 'All shifts'],
];

/** Draw a line through a series of points, skipping gaps. */
function linePath(values: (number | null)[], xs: number[], y: (v: number) => number): string {
  let d = '';
  let started = false;
  values.forEach((v, i) => {
    if (v == null) return;
    d += (started ? ' L ' : 'M ') + xs[i].toFixed(2) + ' ' + y(v).toFixed(2);
    started = true;
  });
  return d || 'M 0 0';
}

export default function OperatorsPage() {
  const kf = useKeenFlo();
  const router = useRouter();
  const { loading, error, reload, agg, scopeKeys, rangeText, range, index, dateFor, tm } = kf;
  const [shift, setShift] = useState<ShiftFilter>('C');

  const view = useMemo(() => {
    if (loading || error || !kf.data) return null;

    const operatorsById = new Map(kf.data.operators.map((o) => [o.id, o]));

    /** Each machine and shift's efficiency on each of the last 7 days. */
    const trend = MACHINES.map((m) => {
      const byShift: Record<ShiftCode, (number | null)[]> = { A: [], B: [], C: [] };
      for (const sh of SHIFT_ORDER) {
        for (let d = -7; d <= -1; d++) {
          const s = statsFromDb(index, dateFor(d), sh, m.id);
          byShift[sh].push(s.target > 0 ? (s.good / s.target) * 100 : null);
        }
      }
      return byShift;
    });

    const shifts: ShiftCode[] = shift === 'all' ? SHIFT_ORDER : [shift];
    const rows: {
      key: string;
      name: string;
      ini: string;
      role: string;
      id: string;
      type: string;
      shiftLabel: string;
      out: string;
      eff: string;
      effC: string;
      shortN: string;
      rej: string;
      spark: string;
      avgY: string;
      dText: string;
      dC: string;
    }[] = [];

    const xs = [0, 1, 2, 3, 4, 5, 6].map((i) => (i / 6) * 100);

    for (const sh of shifts) {
      // One pass over the whole shift scope, then read each machine out of it.
      const perMachine = agg(scopeKeys(range, [sh])).per;
      MACHINES.forEach((m, mi) => {
        const s = perMachine[mi];
        const effV = s.target > 0 ? (s.good / s.target) * 100 : null;
        const series = trend[mi][sh];
        const valid = series.filter((v): v is number => v != null);
        const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;

        let spark = 'M 0 15';
        let avgY = '15';
        if (valid.length) {
          const lo = Math.min(...valid) - 2;
          const hi = Math.max(...valid) + 2;
          const y = (v: number) => 28 - ((v - lo) / (hi - lo)) * 26;
          spark = linePath(series, xs, y);
          avgY = y(avg as number).toFixed(2);
        }
        const diff = effV != null && avg != null ? effV - avg : null;
        const op = operatorsById.get(operatorId(m.id, sh));

        rows.push({
          key: `${m.id}-${sh}`,
          name: op?.name ?? m.ops[sh],
          ini: op?.avatar_initials ?? '',
          role: op?.role ?? 'Machine operator',
          id: m.id,
          type: m.type,
          shiftLabel: `${SHIFTS[sh].name} · ${SHIFTS[sh].label}`,
          out: effV == null ? '—' : fmt(s.good),
          eff: effV == null ? 'Not scheduled' : effV.toFixed(1) + '%',
          effC: effV == null ? C.faint : effV < 85 ? C.red : effV < 89 ? C.amber : C.ink,
          shortN: effV == null ? '—' : String(Math.round(s.shortN)),
          rej: s.gross > 0 ? ((s.rej / s.gross) * 100).toFixed(1) + '%' : '—',
          spark,
          avgY,
          dText:
            diff == null
              ? '—'
              : (diff >= 0 ? '+' : '−') + Math.abs(diff).toFixed(1) + ' vs avg',
          dC: diff == null ? C.faint : diff >= 0 ? C.green : C.red,
        });
      });
    }

    /* top performers over the last 7 days */
    const perf: { name: string; ini: string; where: string; v: number }[] = [];
    MACHINES.forEach((m, mi) => {
      for (const sh of SHIFT_ORDER) {
        const valid = trend[mi][sh].filter((v): v is number => v != null);
        if (valid.length < 5) continue;
        const op = operatorsById.get(operatorId(m.id, sh));
        perf.push({
          name: op?.name ?? m.ops[sh],
          ini: op?.avatar_initials ?? '',
          where: `${m.id} · ${SHIFTS[sh].name}`,
          v: valid.reduce((a, b) => a + b, 0) / valid.length,
        });
      }
    });
    perf.sort((a, b) => b.v - a.v);
    const top = perf.slice(0, 3);

    const support = kf
      .openActions()
      .filter((it) => it.support_name)
      .slice(0, 3);

    return { rows, top, support, scope: rangeText(range).scope, count: `${rows.length} operators` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, kf.data, index, range, shift, tm]);

  if (error) {
    return (
      <>
        <TopBar title="Operators" />
        <ErrorCard title="KeenFlo could not load the operators" message={error} onRetry={reload} />
      </>
    );
  }
  if (!view) {
    return (
      <>
        <TopBar title="Operators" />
        <Loading what="the operators" />
      </>
    );
  }

  const th: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: `1px solid ${C.line}`,
  };
  const td: React.CSSProperties = { padding: 12, borderBottom: `1px solid ${C.hair}` };

  return (
    <>
      <TopBar title="Operators" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 24 }}>
          <section
            aria-labelledby="top-h"
            style={{ ...card, flex: '1 1 360px', minWidth: 0, gap: 14 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id="top-h" style={h2}>
                Top performers this week
              </h2>
              <span style={sub}>
                Highest efficiency over the last 7 days, machine and operator together
              </span>
            </div>
            {view.top.map((tp) => (
              <div key={tp.where} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: C.teal,
                    color: C.white,
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                  }}
                >
                  {tp.ini}
                </span>
                <span
                  style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                  <strong style={{ fontSize: 14 }}>{tp.name}</strong>
                  <span style={{ fontSize: 12, color: C.muted }}>{tp.where}</span>
                </span>
                <strong style={{ fontSize: 16 }}>{tp.v.toFixed(1)}%</strong>
              </div>
            ))}
          </section>

          <section
            aria-labelledby="sup-h"
            style={{ ...card, flex: '1.4 1 420px', minWidth: 0, gap: 14 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id="sup-h" style={h2}>
                Needs support
              </h2>
              <span style={sub}>
                Where a machine keeps losing output and the team could use help
              </span>
            </div>
            {view.support.map((su) => (
              <button
                key={su.id}
                type="button"
                onClick={() => router.push(`/app/actions?focus=${su.id}`)}
                style={{
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: 0,
                  background: C.page,
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  width: '100%',
                  color: C.ink,
                }}
              >
                <span style={{ fontSize: 13 }}>
                  <strong>{su.support_name}</strong>{' '}
                  <span style={{ color: C.muted }}>· {su.support_where}</span>
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.45 }}>{su.support_text}</span>
              </button>
            ))}
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: C.muted }}>
              Performance is shown machine and operator together, because most losses are machine
              or process issues, not people.
            </p>
          </section>
        </div>

        <section aria-labelledby="optab-h" style={card}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id="optab-h" style={h2}>
                Operators
              </h2>
              <span style={sub}>
                {view.scope} · {view.count}. Trend compares with their own 7-day average.
              </span>
            </div>
            <div
              role="group"
              aria-label="Shift"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
            >
              {SHIFT_OPTIONS.map(([k, label]) => (
                <Pill key={k} label={label} on={shift === k} onClick={() => setShift(k)} />
              ))}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                minWidth: 940,
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
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
                    OPERATOR
                  </th>
                  <th scope="col" style={th}>
                    MACHINE
                  </th>
                  <th scope="col" style={th}>
                    SHIFT
                  </th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>
                    OUTPUT
                  </th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>
                    EFFICIENCY
                  </th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>
                    SHORT STOPS
                  </th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>
                    REJECTS
                  </th>
                  <th scope="col" style={{ ...th, padding: '10px 0 10px 12px' }}>
                    TREND VS 7-DAY AVG
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((r) => (
                  <tr key={r.key}>
                    <td style={{ ...td, padding: '12px 12px 12px 0' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            background: C.hair,
                            color: C.slate,
                            fontSize: 12,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: '0 0 auto',
                          }}
                        >
                          {r.ini}
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <strong style={{ fontSize: 14 }}>{r.name}</strong>
                          <span style={{ fontSize: 12, color: C.muted }}>{r.role}</span>
                        </span>
                      </span>
                    </td>
                    <td style={td}>
                      <strong>{r.id}</strong>
                      <br />
                      <span style={{ fontSize: 12, color: C.muted }}>{r.type}</span>
                    </td>
                    <td style={td}>{r.shiftLabel}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }} suppressHydrationWarning>
                      {r.out}
                    </td>
                    <td
                      style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.effC }}
                      suppressHydrationWarning
                    >
                      {r.eff}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} suppressHydrationWarning>
                      {r.shortN}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} suppressHydrationWarning>
                      {r.rej}
                    </td>
                    <td style={{ ...td, padding: '12px 0 12px 12px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg
                          width="90"
                          height="30"
                          viewBox="0 0 100 30"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <line
                            x1="0"
                            x2="100"
                            y1={r.avgY}
                            y2={r.avgY}
                            stroke={C.grey}
                            strokeWidth="1"
                            strokeDasharray="3 3"
                            vectorEffect="non-scaling-stroke"
                          />
                          <path
                            d={r.spark}
                            fill="none"
                            stroke={C.teal}
                            strokeWidth="2"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        </svg>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: r.dC,
                            whiteSpace: 'nowrap',
                          }}
                          suppressHydrationWarning
                        >
                          {r.dText}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
