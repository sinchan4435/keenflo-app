'use client';

import { useSearchParams } from 'next/navigation';
import React, { Suspense, useMemo } from 'react';

import TopBar from '@/components/TopBar';
import { C, CARD_SHADOW, ErrorCard, Loading } from '@/components/ui';
import { problemLoss, severityStyle, startMinuteOf } from '@/lib/analytics';
import { RATE_PER_MIN, SHIFT_ORDER } from '@/lib/config';
import { hm, rs, rupeesShort } from '@/lib/format';
import { LINE_C_IDS, MACHINES, MACHINE_INDEX } from '@/lib/plant';
import { statsFor } from '@/lib/sim-core';
import { ActionItemRow, ActionStatus } from '@/lib/types';
import { labelOf, useKeenFlo } from '@/lib/use-keenflo';

type MiniChart = {
  bars: { h: number; hot: boolean }[];
  refPct: number | null;
  from: string;
  to: string;
};

const COLUMNS: { key: ActionStatus; title: string; dot: string }[] = [
  { key: 'todo', title: 'To do', dot: C.faint },
  { key: 'in_progress', title: 'In progress', dot: C.teal },
  { key: 'done', title: 'Done', dot: C.green },
];

const STATUS_LABEL: Record<ActionStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Resolved',
};

function miniBars(
  values: { v: number; hot: boolean }[],
  max: number | null,
  refValue: number | null,
  labels: [string, string]
): MiniChart {
  const mx = max ?? Math.max(1, ...values.map((b) => b.v));
  return {
    bars: values.map((b) => ({ h: Math.max(2, (b.v / mx) * 100), hot: b.hot })),
    refPct: refValue != null ? (refValue / mx) * 100 : null,
    from: labels[0],
    to: labels[1],
  };
}

function ActionsInner() {
  const kf = useKeenFlo();
  const params = useSearchParams();
  const focus = params.get('focus');
  const {
    loading,
    error,
    reload,
    actions,
    setActionStatus,
    index,
    dateFor,
    tm,
    liveSegments,
    liveBaseline,
    agg,
    fixedAt,
  } = kf;

  const view = useMemo(() => {
    if (loading || error || !kf.data) return null;

    const liveScope = agg([{ kind: 'live', upToMinute: tm }]);

    /* ---------- evidence charts, all measured from real rows ---------- */

    // M-07: short stops per hour of the night shift, averaged over 7 nights.
    const m07PerHour = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let d = -7; d <= -1; d++) {
      for (const e of index.downtime.get(`${dateFor(d)}|C|M-07`) ?? []) {
        if (e.cause !== 'Short stops') continue;
        m07PerHour[Math.min(7, Math.floor(startMinuteOf(e) / 60))] += e.occurrences;
      }
    }

    // M-12: how close to rated speed it ran in each hour of tonight.
    const m12Index = MACHINE_INDEX['M-12'];
    const m12Bars: { v: number; hot: boolean }[] = [];
    for (let h = 0; h < 8; h++) {
      const a = h * 60;
      const b = Math.min(tm, a + 60);
      const w = b - a >= 1 ? statsFor(m12Index, liveSegments[m12Index], a, b, null) : null;
      const running = w ? w.min.run + w.min.slow : 0;
      m12Bars.push({
        v: w && running > 0 ? (w.gross / (running * RATE_PER_MIN)) * 100 : 0,
        hot: false,
      });
    }

    // Line C: average changeover minutes per day for the last 7 days.
    const lcBars: { v: number; hot: boolean }[] = [];
    for (let d = -7; d <= -1; d++) {
      let n = 0;
      let mins = 0;
      for (const sh of SHIFT_ORDER) {
        for (const mid of LINE_C_IDS) {
          for (const e of index.downtime.get(`${dateFor(d)}|${sh}|${mid}`) ?? []) {
            if (e.cause !== 'Setup/changeover') continue;
            n++;
            mins += Number(e.duration_min);
          }
        }
      }
      const v = n ? mins / n : 0;
      lcBars.push({ v, hot: v > 45 });
    }

    // M-18: reject rate by hour of shift, over the last 7 days.
    const m18Bars: { v: number; hot: boolean }[] = [];
    for (let h = 0; h < 8; h++) {
      let gross = 0;
      let rej = 0;
      for (let d = -7; d <= -1; d++) {
        for (const sh of SHIFT_ORDER) {
          const row = (index.hourly.get(`${dateFor(d)}|${sh}|M-18`) ?? []).find(
            (r) => r.hour === h
          );
          if (row) {
            gross += row.produced;
            rej += row.rejects;
          }
        }
      }
      m18Bars.push({ v: gross ? (rej / gross) * 100 : 0, hot: h >= 4 });
    }

    // M-03: breakdown minutes per day for the last 10 days.
    const m03Bars: { v: number; hot: boolean }[] = [];
    for (let d = -10; d <= -1; d++) {
      let mins = 0;
      for (const sh of SHIFT_ORDER) {
        for (const e of index.downtime.get(`${dateFor(d)}|${sh}|M-03`) ?? []) {
          if (e.cause === 'Breakdown') mins += Number(e.duration_min);
        }
      }
      m03Bars.push({ v: mins, hot: d < -4 });
    }

    function chartFor(id: string): { chart: MiniChart; text: string } {
      if (id === 'm07') {
        const mi = MACHINE_INDEX['M-07'];
        const s = statsFor(mi, liveSegments[mi], 0, tm, kf.live.fixRejAt);
        const total = m07PerHour.reduce((a, b) => a + b, 0);
        const windowPct = total
          ? Math.round(((m07PerHour[4] + m07PerHour[5]) / total) * 100)
          : 0;
        return {
          chart: miniBars(
            m07PerHour.map((v, h) => ({ v: v / 7, hot: h === 4 || h === 5 })),
            null,
            null,
            ['22:00', '06:00']
          ),
          text: `${s.shortN} stops tonight. Over the last 7 nights, ${windowPct}% of night-shift stops fell between 02:00 and 04:00.`,
        };
      }
      if (id === 'm12') {
        return {
          chart: miniBars(m12Bars, 100, 100, ['22:00', '06:00']),
          text: 'Runs at 88% of rated speed whenever it runs, on all three shifts for the last 7 days. Line = rated speed.',
        };
      }
      if (id === 'linec') {
        const n = lcBars.length;
        const avg = n ? lcBars.reduce((a, b) => a + b.v, 0) / n : 0;
        return {
          chart: miniBars(lcBars, 80, 30, [labelOf(dateFor(-7), true), labelOf(dateFor(-1), true)]),
          text: `Mould changes in the last 7 days averaged ${Math.round(
            avg
          )} min. Line = 30 min standard.`,
        };
      }
      if (id === 'm18') {
        return {
          chart: miniBars(m18Bars, null, null, ['Hour 1', 'Hour 8']),
          text: `Rejects stay near 1% for the first 4 hours, then climb to ${m18Bars[7].v.toFixed(
            1
          )}% by the end of the shift (7-day average).`,
        };
      }
      return {
        chart: miniBars(m03Bars, null, null, [
          labelOf(dateFor(-10), true),
          labelOf(dateFor(-1), true),
        ]),
        text: `Breakdown minutes per day. No coolant pump trips since the fix on ${labelOf(
          dateFor(-4)
        )}.`,
      };
    }

    /**
     * What a fix has saved: run the same window twice, once on the untouched
     * shift and once on the fixed one, and take the difference.
     */
    function recoveredText(it: ActionItemRow): string {
      if (it.id === 'm03') {
        return `Fixed on ${labelOf(dateFor(-4))}. No breakdowns since.`;
      }
      const from = fixedAt[it.id];
      if (from == null || tm <= from) return 'Resolved.';

      const statsOf = (segments: typeof liveSegments, fixRej: number | null) =>
        MACHINES.map((_, mi) => statsFor(mi, segments[mi], from, tm, fixRej));

      const before = problemLoss(it.id, statsOf(liveBaseline, null), LINE_C_IDS);
      const after = problemLoss(it.id, statsOf(liveSegments, kf.live.fixRejAt), LINE_C_IDS);
      const saved = Math.max(0, before - after);

      if (saved >= 1) return `${rs(saved)} recovered since the fix at ${hm(from)}`;
      return it.id === 'linec'
        ? `Fixed at ${hm(from)}. Savings show at the next mould change.`
        : `Fixed at ${hm(from)}. Savings show as the shift runs.`;
    }

    const openItems = actions.filter((a) => a.status !== 'done');
    const openSum = openItems.reduce((a, it) => a + it.rupees_per_week, 0);

    const columns = COLUMNS.map((col) => {
      const items = actions
        .filter((a) => a.status === col.key)
        .sort((a, b) => b.rupees_per_week - a.rupees_per_week);
      const sum = items.reduce((a, it) => a + it.rupees_per_week, 0);
      return {
        ...col,
        count: items.length,
        sum:
          col.key === 'done'
            ? items.length
              ? 'Fixed'
              : ''
            : items.length
              ? `${rupeesShort(sum)} / week at stake`
              : '',
        cards: items.map((it) => {
          const ev = chartFor(it.id);
          const sev = severityStyle(it.severity);
          return {
            it,
            sev,
            chart: ev.chart,
            evText: it.id === 'm07' || it.id === 'linec' ? ev.text : it.evidence,
            recovered: it.status === 'done' ? recoveredText(it) : '',
            liveLoss: problemLoss(it.id, liveScope.per, LINE_C_IDS),
          };
        }),
      };
    });

    return {
      columns,
      openN: openItems.length,
      openSum: rupeesShort(openSum),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, kf.data, actions, index, tm, liveSegments, liveBaseline, fixedAt]);

  if (error) {
    return (
      <>
        <TopBar title="Action items" showRange={false} />
        <ErrorCard title="KeenFlo could not load the action items" message={error} onRetry={reload} />
      </>
    );
  }
  if (!view) {
    return (
      <>
        <TopBar title="Action items" showRange={false} />
        <Loading what="the action items" />
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Action items"
        showRange={false}
        note="Ranked by ₹ lost per week if unfixed"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section
          aria-label="Summary"
          style={{
            background: 'linear-gradient(81.62deg, #313860 2.25%, #151928 79.87%)',
            borderRadius: 15,
            padding: '24px 28px',
            color: C.white,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.35,
              flex: '999 1 480px',
            }}
          >
            {view.openN} open action items. Fixing them is worth about {view.openSum} a week.
          </p>
          <span
            style={{
              flex: '1 1 260px',
              fontSize: 13,
              lineHeight: 1.5,
              color: 'rgba(255, 255, 255, 0.75)',
            }}
          >
            Each item is ranked by what it costs per week if nothing changes, based on the last 7
            days.
          </span>
        </section>

        {view.columns.map((col) => (
          <section key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <span
                aria-hidden="true"
                style={{ width: 10, height: 10, borderRadius: '50%', background: col.dot }}
              />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{col.title}</h2>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.muted,
                  background: C.hair,
                  borderRadius: 999,
                  padding: '3px 9px',
                }}
              >
                {col.count}
              </span>
              <span style={{ fontSize: 13, color: C.muted }}>{col.sum}</span>
            </div>

            {col.cards.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  background: C.white,
                  borderRadius: 15,
                  padding: '18px 22px',
                  fontSize: 14,
                  color: C.muted,
                }}
              >
                Nothing here.
              </p>
            ) : null}

            {col.cards.map((cd) => {
              const it = cd.it;
              const focused = focus === it.id;
              return (
                <article
                  key={it.id}
                  id={`item-${it.id}`}
                  style={{
                    background: C.white,
                    borderRadius: 15,
                    boxShadow: focused
                      ? `0 0 0 2px ${C.teal}, ${CARD_SHADOW}`
                      : CARD_SHADOW,
                    padding: 22,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 18,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        minWidth: 0,
                        flex: '999 1 420px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: cd.sev.tint,
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
                              background: cd.sev.c,
                            }}
                          />
                          {cd.sev.label}
                        </span>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: C.hair,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {it.owner_team}
                        </span>
                        <span style={{ fontSize: 12, color: C.muted }}>
                          {it.who} · Due {it.due_date ? labelOf(it.due_date) : '—'} ·{' '}
                          {it.opened_on ? `Opened ${labelOf(it.opened_on)}` : 'Opened'}
                        </span>
                      </div>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{it.title}</h3>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: 2,
                        flex: '1 0 auto',
                      }}
                    >
                      <strong style={{ fontSize: 22, fontWeight: 700 }}>
                        {rupeesShort(it.rupees_per_week)}
                      </strong>
                      <span style={{ fontSize: 12, color: C.muted }}>
                        {it.status === 'done'
                          ? 'was lost per week before the fix'
                          : 'lost per week if unfixed'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                    {/* evidence */}
                    <div
                      style={{
                        flex: '1 1 260px',
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.faint }}>
                        EVIDENCE
                      </span>
                      <div
                        aria-hidden="true"
                        style={{
                          position: 'relative',
                          height: 64,
                          display: 'flex',
                          alignItems: 'flex-end',
                          gap: 3,
                          borderBottom: `1px solid ${C.line}`,
                        }}
                      >
                        {cd.chart.bars.map((b, i) => (
                          <span
                            key={i}
                            style={{
                              flex: '1 1 0',
                              height: `${b.h}%`,
                              background: b.hot
                                ? it.id === 'm07' || it.id === 'm03'
                                  ? C.red
                                  : C.amber
                                : C.teal,
                              borderRadius: '3px 3px 0 0',
                            }}
                          />
                        ))}
                        {cd.chart.refPct != null ? (
                          <span
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              bottom: `${cd.chart.refPct}%`,
                              borderTop: `1.5px dashed ${C.ink}`,
                            }}
                          />
                        ) : null}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          color: C.faint,
                        }}
                      >
                        <span>{cd.chart.from}</span>
                        <span>{cd.chart.to}</span>
                      </div>
                      <p
                        style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}
                        suppressHydrationWarning
                      >
                        {cd.evText}
                      </p>
                    </div>

                    {/* likely causes */}
                    <div
                      style={{
                        flex: '1 1 220px',
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.faint }}>
                        LIKELY CAUSES
                      </span>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: 18,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          fontSize: 13,
                          lineHeight: 1.45,
                        }}
                      >
                        {it.likely_causes.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>

                    {/* fix steps */}
                    <div
                      style={{
                        flex: '1.3 1 280px',
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.faint }}>
                        SUGGESTED FIX
                      </span>
                      <ol
                        style={{
                          margin: 0,
                          padding: 0,
                          listStyle: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          fontSize: 13,
                          lineHeight: 1.45,
                        }}
                      >
                        {it.fix_steps.map((t, i) => (
                          <li key={t} style={{ display: 'flex', gap: 10 }}>
                            <span
                              aria-hidden="true"
                              style={{
                                flex: '0 0 auto',
                                width: 22,
                                height: 22,
                                borderRadius: 8,
                                background: C.teal,
                                color: C.white,
                                fontSize: 11,
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {i + 1}
                            </span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  {/* footer */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      borderTop: `1px solid ${C.hair}`,
                      paddingTop: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 700,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background:
                              it.status === 'done'
                                ? C.green
                                : it.status === 'in_progress'
                                  ? C.teal
                                  : C.faint,
                          }}
                        />
                        {STATUS_LABEL[it.status]}
                      </span>
                      {it.status === 'done' ? (
                        <strong style={{ color: '#2F855A' }} suppressHydrationWarning>
                          {cd.recovered}
                        </strong>
                      ) : (
                        <span style={{ color: C.muted }} suppressHydrationWarning>
                          {rs(cd.liveLoss)} lost so far this shift
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {it.status === 'todo' ? (
                        <button
                          type="button"
                          onClick={() => setActionStatus(it.id, 'in_progress')}
                          style={{
                            font: 'inherit',
                            border: `1px solid ${C.line}`,
                            borderRadius: 12,
                            padding: '10px 16px',
                            background: C.white,
                            color: C.ink,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Mark in progress
                        </button>
                      ) : null}
                      {it.status !== 'done' ? (
                        <button
                          type="button"
                          onClick={() => setActionStatus(it.id, 'done')}
                          style={{
                            font: 'inherit',
                            border: 0,
                            borderRadius: 12,
                            padding: '11px 18px',
                            background: C.teal,
                            color: C.white,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Mark resolved
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActionStatus(it.id, 'todo')}
                          style={{
                            font: 'inherit',
                            border: `1px solid ${C.line}`,
                            borderRadius: 12,
                            padding: '10px 16px',
                            background: C.white,
                            color: C.ink,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}

export default function ActionsPage() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar title="Action items" showRange={false} />
          <Loading what="the action items" />
        </>
      }
    >
      <ActionsInner />
    </Suspense>
  );
}
