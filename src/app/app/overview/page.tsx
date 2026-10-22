'use client';

import { useRouter } from 'next/navigation';
import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

import TopBar from '@/components/TopBar';
import { BarRow, C, CARD_SHADOW, ErrorCard, Loading, card, h2, sub } from '@/components/ui';
import { problemLoss, topIssue } from '@/lib/analytics';
import { CAUSES, RATED_PER_HOUR, SHIFTS, SHIFT_ORDER, STATE_STYLE } from '@/lib/config';
import { delta, fmt, hm, pct, rs, rsShort } from '@/lib/format';
import { LINE_C_IDS, MACHINES } from '@/lib/plant';
import { currentSegment, statsFor } from '@/lib/sim-core';
import { labelOf, useKeenFlo } from '@/lib/use-keenflo';

const KPI_ICONS: React.ReactNode[] = [
  <>
    <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
    <path d="M3 7.5 12 12l9-4.5M12 12v9" />
  </>,
  <>
    <path d="M4 17a8 8 0 1 1 16 0" />
    <path d="M12 17l4-5" />
  </>,
  <>
    <path d="M3 7l6 6 4-4 8 8" />
    <path d="M15 17h6v-6" />
  </>,
  <path d="M7 4h11M7 9h11M7 4h3.5a5 5 0 0 1 0 10H7l8 7" />,
];

export default function OverviewPage() {
  const kf = useKeenFlo();
  const router = useRouter();
  const {
    loading,
    error,
    reload,
    agg,
    scopeKeys,
    compareKeys,
    rangeText,
    range,
    dateFor,
    tm,
    liveSegments,
    actions,
    openActions,
    index,
  } = kf;

  const view = useMemo(() => {
    if (loading || error || !kf.data) return null;

    const liveScope = agg([{ kind: 'live', upToMinute: tm }]);
    const open = openActions()
      .map((it) => ({ it, L: problemLoss(it.id, liveScope.per, LINE_C_IDS) }))
      .sort((a, b) => b.L - a.L);
    const top = open.slice(0, 3);
    const topSum = top.reduce((s, x) => s + x.L, 0);
    const share = liveScope.total.lost > 0 ? Math.round((topSum / liveScope.total.lost) * 100) : 0;

    const hero =
      liveScope.total.target <= 0
        ? 'Night shift has just started. Nothing lost yet.'
        : `Night shift is running at ${pct(liveScope.total.good, liveScope.total.target)}. ` +
          `You’ve lost ${fmt(liveScope.total.lost)} units (${rsShort(liveScope.total.lost)}) so far.` +
          (top.length
            ? ` ${top.length}${top.length === 1 ? ' issue causes ' : ' issues cause '}${share}% of it.`
            : '');

    /* KPIs */
    const cur = agg(scopeKeys(range));
    const prv = agg(compareKeys(range));
    const rt = rangeText(range);
    const effC = cur.total.target > 0 ? (cur.total.good / cur.total.target) * 100 : 0;
    const effP = prv.total.target > 0 ? (prv.total.good / prv.total.target) * 100 : 0;

    const kpis = [
      {
        label: 'Produced vs target',
        value: fmt(cur.total.good),
        suffix: ` / ${fmt(cur.total.target)}`,
        d: delta(cur.total.good, prv.total.good, true, 'pct', rt.vs),
      },
      {
        label: 'Plant efficiency',
        value: pct(cur.total.good, cur.total.target),
        suffix: '',
        d: delta(effC, effP, true, 'pts', rt.vs),
      },
      {
        label: 'Units lost',
        value: fmt(cur.total.lost),
        suffix: '',
        d: delta(cur.total.lost, prv.total.lost, false, 'pct', rt.vs),
      },
      {
        label: '₹ lost',
        value: rsShort(cur.total.lost),
        suffix: '',
        d: delta(cur.total.lost, prv.total.lost, false, 'pct', rt.vs),
      },
    ];

    /* fix these first */
    const fixRows = top.map((x, i) => ({
      id: x.it.id,
      dot: i === 0 || x.it.severity === 'Critical' ? C.red : C.amber,
      who: x.it.who,
      problem: problemSentence(x.it.id),
      rs: rs(x.L),
      fix: x.it.suggested_fix,
      rank: String(i + 1),
    }));

    function problemSentence(id: string): string {
      if (id === 'm07') {
        const s = statsFor(
          MACHINES.findIndex((m) => m.id === 'M-07'),
          liveSegments[MACHINES.findIndex((m) => m.id === 'M-07')],
          0,
          tm,
          kf.live.fixRejAt
        );
        return `${s.shortN} short stops since ${SHIFTS.C.range.slice(0, 5)}.`;
      }
      if (id === 'm12') return 'Running 12% below rated speed all shift.';
      if (id === 'linec') {
        let n = 0;
        let mins = 0;
        for (const mid of LINE_C_IDS) {
          const mi = MACHINES.findIndex((m) => m.id === mid);
          for (const g of liveSegments[mi]) {
            if (g.st === 'co' && g.s < tm) {
              n++;
              mins += Math.min(g.e, tm) - g.s;
            }
          }
        }
        return `${n} ${n === 1 ? 'mould change' : 'mould changes'} tonight, ${Math.round(
          mins
        )} min in total, against a 30 min standard each.`;
      }
      if (id === 'm18') {
        const mi = MACHINES.findIndex((m) => m.id === 'M-18');
        const s = statsFor(mi, liveSegments[mi], Math.max(0, tm - 60), tm, kf.live.fixRejAt);
        const r = s.gross > 0 ? (s.rej / s.gross) * 100 : 0;
        return tm > 240
          ? `Rejects at ${r.toFixed(1)}% in the last hour and rising.`
          : 'Rejects usually climb after 4 hours of running.';
      }
      return '';
    }

    /* output vs target, per hour of the live shift */
    const scheduled = liveSegments.filter(
      (sg) => sg[0].st !== 'idle' || sg.length > 1
    ).length;
    const targetPerHour = scheduled * RATED_PER_HOUR;

    const yesterdayNight = dateFor(-1);
    const chartRows: {
      label: string;
      tonight: number | null;
      lastNight: number | null;
    }[] = [];

    for (let h = 0; h < 8; h++) {
      const a = h * 60;
      const b = Math.min(tm, a + 60);
      let tonight: number | null = null;
      if (b - a >= 5) {
        let g = 0;
        liveSegments.forEach((sg, mi) => {
          g += statsFor(mi, sg, a, b, kf.live.fixRejAt).good;
        });
        tonight = (g / (b - a)) * 60;
      }
      const y = agg([{ kind: 'db', date: yesterdayNight, shift: 'C' }], a, a + 60);
      chartRows.push({
        label: hm(a),
        tonight,
        lastNight: y.total.good > 0 ? y.total.good : null,
      });
    }

    const allValues = chartRows
      .flatMap((r) => [r.tonight, r.lastNight])
      .filter((v): v is number => v != null)
      .concat([targetPerHour]);
    const lo = Math.min(28000, Math.floor((Math.min(...allValues) - 1000) / 2000) * 2000);
    const hi = Math.max(40000, Math.ceil((Math.max(...allValues) + 500) / 2000) * 2000);
    const ticks: number[] = [];
    for (let v = hi; v >= lo; v -= 4000) ticks.push(v);

    /* where did the output go */
    const maxLoss = Math.max(1, ...CAUSES.map((c) => cur.total.L[c.key]));
    const where = CAUSES.map((c) => ({
      key: c.key,
      label: c.label,
      units: fmt(cur.total.L[c.key]),
      rs: rs(cur.total.L[c.key]),
      share:
        cur.total.lost > 0 ? Math.round((cur.total.L[c.key] / cur.total.lost) * 100) + '%' : '—',
      w: (cur.total.L[c.key] / maxLoss) * 100,
    })).sort((a, b) => b.w - a.w);

    /* yesterday at a glance */
    const yday = SHIFT_ORDER.map((sh) => {
      const a = agg([{ kind: 'db', date: yesterdayNight, shift: sh }]);
      let wi = 0;
      a.per.forEach((p, mi) => {
        if (p.lost > a.per[wi].lost) wi = mi;
      });
      const iss = topIssue(a.per[wi]);
      const eff = a.total.target > 0 ? (a.total.good / a.total.target) * 100 : 0;
      return {
        sh,
        name: SHIFTS[sh].name,
        label: SHIFTS[sh].label,
        range: SHIFTS[sh].range,
        effV: eff,
        eff: eff.toFixed(1) + '%',
        lost: fmt(a.total.lost),
        worstId: MACHINES[wi].id,
        issueL: iss.label.toLowerCase(),
      };
    });
    const worst = yday.reduce((w, r) => (r.effV < w.effV ? r : w), yday[0]);
    const ydaySentence =
      `Yesterday’s ${worst.label.toLowerCase()} shift was the worst: ${worst.eff}, ` +
      `mostly ${worst.worstId} ${worst.issueL}.`;

    /* live now */
    const counts: Record<string, number> = { run: 0, slow: 0, co: 0, stop: 0, idle: 0 };
    liveSegments.forEach((sg) => {
      counts[currentSegment(sg, tm).st]++;
    });
    const liveNow = (['run', 'slow', 'co', 'stop', 'idle'] as const).map((k) => ({
      n: counts[k],
      ...STATE_STYLE[k],
    }));

    return {
      hero,
      kpis,
      fixRows,
      chartRows,
      lo,
      hi,
      ticks,
      targetPerHour,
      where,
      whereScope: rt.scope,
      whereTotal: fmt(cur.total.lost),
      whereRs: rs(cur.total.lost),
      yday: yday.map((r) => ({
        ...r,
        flag: r === worst ? C.red : C.green,
        flagWord: r === worst ? 'Worst' : 'OK',
      })),
      ydaySentence,
      ydayLabel: labelOf(yesterdayNight),
      liveNow,
      kpiScope: rt.scope,
      shiftNow: `Shift C · Night · ${hm(tm)}`,
    };
    // index is part of the data identity through kf.data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, kf.data, tm, range, index, liveSegments, actions]);

  if (error) {
    return (
      <>
        <TopBar title="Overview" />
        <ErrorCard title="KeenFlo could not load the plant" message={error} onRetry={reload} />
      </>
    );
  }
  if (!view) {
    return (
      <>
        <TopBar title="Overview" />
        <Loading />
      </>
    );
  }

  return (
    <>
      <TopBar title="Overview" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* right now */}
        <section
          aria-label="Right now"
          style={{
            background: 'linear-gradient(81.62deg, #313860 2.25%, #151928 79.87%)',
            borderRadius: 15,
            padding: '30px 32px',
            color: C.white,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 24,
          }}
        >
          <div
            style={{
              flex: '999 1 520px',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'rgba(255, 255, 255, 0.72)',
                letterSpacing: '0.04em',
              }}
              suppressHydrationWarning
            >
              RIGHT NOW · {view.shiftNow}
            </span>
            <p
              style={{
                margin: 0,
                fontSize: 26,
                lineHeight: 1.32,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                textWrap: 'pretty',
              }}
              suppressHydrationWarning
            >
              {view.hero}
            </p>
          </div>
          <div style={{ flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button
              type="button"
              onClick={() => router.push('/app/actions')}
              style={{
                font: 'inherit',
                border: 0,
                borderRadius: 12,
                padding: '13px 22px',
                background: C.teal,
                color: C.white,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              See action items
            </button>
            <button
              type="button"
              onClick={() => router.push('/app/machines')}
              style={{
                font: 'inherit',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: 12,
                padding: '12px 20px',
                background: 'transparent',
                color: C.white,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              All machines
            </button>
          </div>
        </section>

        {/* live now */}
        <section
          aria-label="Live now"
          style={{
            background: C.white,
            borderRadius: 15,
            boxShadow: CARD_SHADOW,
            padding: '14px 22px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px 18px',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: C.faint }}>LIVE NOW</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {view.liveNow.map((lv) => (
              <span
                key={lv.word}
                suppressHydrationWarning
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: lv.tint,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 8, height: 8, borderRadius: '50%', background: lv.c }}
                />
                {lv.n} {lv.word}
              </span>
            ))}
          </div>
        </section>

        {/* key numbers */}
        <section aria-labelledby="kpi-h" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 id="kpi-h" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.faint }}>
            KEY NUMBERS · {view.kpiScope.toUpperCase()}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))',
              gap: 24,
            }}
          >
            {view.kpis.map((k, i) => (
              <div
                key={k.label}
                style={{
                  background: C.white,
                  borderRadius: 15,
                  boxShadow: CARD_SHADOW,
                  padding: '18px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
                  suppressHydrationWarning
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.faint }}>{k.label}</span>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>
                    {k.value}
                    {k.suffix ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.faint }}>
                        {k.suffix}
                      </span>
                    ) : null}
                  </span>
                  <span style={{ fontSize: 12 }}>
                    <strong style={{ color: k.d.color }}>{k.d.text}</strong>{' '}
                    <span style={{ color: C.faint }}>{k.d.vs}</span>
                  </span>
                </div>
                <span
                  style={{
                    width: 45,
                    height: 45,
                    borderRadius: 12,
                    background: C.teal,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                  }}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.white}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {KPI_ICONS[i]}
                  </svg>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* fix these first + output chart */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 24 }}>
          <section
            aria-labelledby="fix-h"
            style={{ ...card, flex: '7 1 520px', minWidth: 0, gap: 6 }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                paddingBottom: 8,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 id="fix-h" style={h2}>
                  Fix these first
                </h2>
                <span style={sub}>
                  Ranked by ₹ lost so far this shift. Click one to see the action item.
                </span>
              </div>
              <button
                type="button"
                onClick={() => router.push('/app/actions')}
                style={{
                  font: 'inherit',
                  border: 0,
                  background: 'transparent',
                  color: C.tealDark,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '6px 0',
                }}
              >
                All action items →
              </button>
            </div>

            {view.fixRows.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: '18px 0',
                  borderTop: `1px solid ${C.hair}`,
                  fontSize: 14,
                  color: C.muted,
                }}
              >
                No open issues right now. Every action item is resolved.
              </p>
            ) : (
              view.fixRows.map((fr) => (
                <button
                  key={fr.id}
                  type="button"
                  className="kf-card-btn"
                  onClick={() => router.push(`/app/actions?focus=${fr.id}`)}
                  style={{
                    font: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: C.white,
                    border: 0,
                    borderTop: `1px solid ${C.hair}`,
                    padding: '18px 0',
                    display: 'flex',
                    gap: 16,
                    alignItems: 'flex-start',
                    width: '100%',
                    color: C.ink,
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 auto',
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: fr.dot,
                      color: C.white,
                      fontSize: 13,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {fr.rank}
                  </span>
                  <span
                    style={{
                      flex: '1 1 auto',
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <strong style={{ fontSize: 15, fontWeight: 700 }}>{fr.who}</strong>
                    <span style={{ fontSize: 14, lineHeight: 1.45 }} suppressHydrationWarning>
                      {fr.problem}
                    </span>
                    <span style={{ fontSize: 13, lineHeight: 1.45, color: C.muted }}>
                      <strong style={{ color: C.tealDark }}>Suggested fix:</strong> {fr.fix}
                    </span>
                  </span>
                  <span
                    style={{
                      flex: '0 0 auto',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 2,
                    }}
                  >
                    <strong style={{ fontSize: 18, fontWeight: 700 }} suppressHydrationWarning>
                      {fr.rs}
                    </strong>
                    <span style={{ fontSize: 11, color: C.faint }}>lost so far</span>
                  </span>
                </button>
              ))
            )}
          </section>

          <section aria-labelledby="out-h" style={{ ...card, flex: '5 1 380px', minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id="out-h" style={h2}>
                Output vs target
              </h2>
              <span style={sub}>Units per hour, Shift C. The current hour is pro-rated.</span>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px 16px',
                fontSize: 12,
                color: C.muted,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  aria-hidden="true"
                  style={{ width: 16, height: 3, borderRadius: 2, background: C.teal }}
                />
                Tonight
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 16,
                    height: 0,
                    borderTop: '2px dashed rgba(79, 209, 197, 0.6)',
                  }}
                />
                Last night
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{ width: 16, height: 2, background: C.faint }} />
                Target {fmt(view.targetPerHour)}/hr
              </span>
            </div>
            <div style={{ height: 250, marginTop: 6 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={view.chartRows}
                  margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
                >
                  <CartesianGrid stroke={C.line} strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: C.faint }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[view.lo, view.hi]}
                    ticks={view.ticks}
                    tickFormatter={(v: number) => Math.round(v / 1000) + 'k'}
                    tick={{ fontSize: 11, fill: C.faint }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <ReferenceLine y={view.targetPerHour} stroke={C.faint} strokeWidth={1.5} />
                  <Line
                    type="linear"
                    dataKey="lastNight"
                    stroke="rgba(79, 209, 197, 0.6)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Line
                    type="linear"
                    dataKey="tonight"
                    stroke={C.teal}
                    strokeWidth={3}
                    dot={{ r: 4, fill: C.white, stroke: C.teal, strokeWidth: 2 }}
                    isAnimationActive={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* where did it go + yesterday */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 24 }}>
          <section
            aria-labelledby="where-h"
            style={{ ...card, flex: '7 1 520px', minWidth: 0, gap: 10 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 6 }}>
              <h2 id="where-h" style={h2}>
                Where did the output go
              </h2>
              <span style={sub} suppressHydrationWarning>
                {view.whereScope} · {view.whereTotal} units lost ({view.whereRs}). Click a cause to
                see the machines behind it.
              </span>
            </div>
            {view.where.map((w) => (
              <BarRow
                key={w.key}
                widthPct={w.w}
                onClick={() => router.push(`/app/machines?cause=${w.key}`)}
                label={
                  <strong style={{ fontWeight: 700 }}>
                    {w.label} <span style={{ fontWeight: 600, color: C.faint }}>{w.share}</span>
                  </strong>
                }
                right={
                  <span suppressHydrationWarning>
                    {w.units} units · <strong style={{ fontWeight: 700 }}>{w.rs}</strong>
                  </span>
                }
              />
            ))}
          </section>

          <section aria-labelledby="yday-h" style={{ ...card, flex: '5 1 380px', minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id="yday-h" style={h2}>
                Yesterday at a glance
              </h2>
              <span style={sub}>{view.ydayLabel}</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(120px, 100%), 1fr))',
                gap: 12,
              }}
            >
              {view.yday.map((yd) => (
                <div
                  key={yd.sh}
                  style={{
                    background: C.page,
                    borderRadius: 12,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.muted,
                    }}
                  >
                    {yd.name}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 7, height: 7, borderRadius: '50%', background: yd.flag }}
                      />
                      {yd.flagWord}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, color: C.faint }}>
                    {yd.label} · {yd.range}
                  </span>
                  <strong style={{ fontSize: 20, fontWeight: 700 }}>{yd.eff}</strong>
                  <span style={{ fontSize: 12 }}>{yd.lost} units lost</span>
                  <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
                    Worst: {yd.worstId} · {yd.issueL}
                  </span>
                </div>
              ))}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.5,
                background: C.page,
                borderRadius: 12,
                padding: '12px 14px',
              }}
            >
              {view.ydaySentence}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
