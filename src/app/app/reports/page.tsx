'use client';

import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

import PrintableReport, { ReportData } from '@/components/PrintableReport';
import TopBar from '@/components/TopBar';
import { C, CARD_SHADOW, ErrorCard, Loading, Pill, card, h2, sub } from '@/components/ui';
import { Aggregate, Scope, topIssue } from '@/lib/analytics';
import { CAUSES, PLANT_NAME, SHIFTS, SHIFT_ORDER, ShiftCode } from '@/lib/config';
import { clock, delta, fmt, pct, rs, rsShort, rupeesShort } from '@/lib/format';
import { LINES, MACHINES } from '@/lib/plant';
import { labelOf, useKeenFlo } from '@/lib/use-keenflo';

const KPI_ICONS: React.ReactNode[] = [
  <React.Fragment key="produced">
    <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
    <path d="M3 7.5 12 12l9-4.5M12 12v9" />
  </React.Fragment>,
  <React.Fragment key="efficiency">
    <path d="M4 17a8 8 0 1 1 16 0" />
    <path d="M12 17l4-5" />
  </React.Fragment>,
  <React.Fragment key="lost">
    <path d="M3 7l6 6 4-4 8 8" />
    <path d="M15 17h6v-6" />
  </React.Fragment>,
  <path key="rupees" d="M7 4h11M7 9h11M7 4h3.5a5 5 0 0 1 0 10H7l8 7" />,
];

const LINE_STYLE: Record<string, { stroke: string; dash?: string; width: number }> = {
  plant: { stroke: C.teal, width: 3.5 },
  A: { stroke: C.ink, width: 2 },
  B: { stroke: C.ink, dash: '5 4', width: 2 },
  C: { stroke: C.faint, width: 2 },
  D: { stroke: C.faint, dash: '5 4', width: 2 },
};

export default function ReportsPage() {
  const kf = useKeenFlo();
  const { loading, error, reload, agg, dayKeys, dateFor, tm, t, index, actions, liveSegments } = kf;

  const [day, setDay] = useState(-1);
  const [repShift, setRepShift] = useState<ShiftCode>('C');
  const [report, setReport] = useState<'daily' | 'shift' | null>(null);

  const view = useMemo(() => {
    if (loading || error || !kf.data) return null;

    const keys = dayKeys(day);
    const total = agg(keys);
    const perShift = SHIFT_ORDER.map((sh, i) => {
      const a = agg([keys[i]]);
      return {
        sh,
        name: SHIFTS[sh].name,
        label: SHIFTS[sh].label,
        agg: a,
        eff: a.total.target > 0 ? (a.total.good / a.total.target) * 100 : 0,
      };
    });

    /** Every machine-and-cause loss on this day, biggest first. */
    const lossesOf = (source: Aggregate, shift?: ShiftCode) => {
      const out: { id: string; label: string; v: number; op?: string }[] = [];
      source.per.forEach((p, mi) => {
        for (const c of CAUSES) {
          if (p.L[c.key] < 1) continue;
          let label: string = c.label;
          if (c.key === 'stop') label = topIssue(p).key === 'stop' ? topIssue(p).label : 'Stopped';
          out.push({
            id: MACHINES[mi].id,
            label,
            v: p.L[c.key],
            op: shift ? MACHINES[mi].ops[shift] : undefined,
          });
        }
      });
      return out.sort((a, b) => b.v - a.v);
    };

    const losses = lossesOf(total);

    const prev =
      day === 0
        ? agg([
            { kind: 'db', date: dateFor(-1), shift: 'A' },
            { kind: 'db', date: dateFor(-1), shift: 'B' },
            { kind: 'db', date: dateFor(-1), shift: 'C', upToMinute: tm },
          ] as Scope[])
        : agg(dayKeys(day - 1));

    const vs = day === 0 ? 'vs same time yesterday' : `vs ${labelOf(dateFor(day - 1), true)}`;
    const effC = total.total.target > 0 ? (total.total.good / total.total.target) * 100 : 0;
    const effP = prev.total.target > 0 ? (prev.total.good / prev.total.target) * 100 : 0;

    const kpis = [
      {
        label: 'Output',
        value: fmt(total.total.good),
        suffix: ` / ${fmt(total.total.target)}`,
        d: delta(total.total.good, prev.total.good, true, 'pct', vs),
      },
      {
        label: 'Efficiency',
        value: pct(total.total.good, total.total.target),
        suffix: '',
        d: delta(effC, effP, true, 'pts', vs),
      },
      {
        label: 'Units lost',
        value: fmt(total.total.lost),
        suffix: '',
        d: delta(total.total.lost, prev.total.lost, false, 'pct', vs),
      },
      {
        label: '₹ lost',
        value: rsShort(total.total.lost),
        suffix: '',
        d: delta(total.total.lost, prev.total.lost, false, 'pct', vs),
      },
    ];

    const shiftBars = perShift.map((s) => ({
      name: s.name,
      label: s.label,
      Target: Math.round(s.agg.total.target),
      Produced: Math.round(s.agg.total.good),
      eff: s.agg.total.target > 0 ? s.eff.toFixed(1) + '%' : '—',
      lost: fmt(s.agg.total.lost),
      effC: s.eff < 86 ? C.red : C.ink,
    }));

    const top5 = losses.slice(0, 5).map((l, i) => ({
      n: i + 1,
      id: l.id,
      label: l.label,
      units: fmt(l.v),
      rs: rs(l.v),
    }));

    /* action items opened, started or closed on this day */
    const dayDate = dateFor(day);
    const acts: { t: string; what: string; c: string; owner: string }[] = [];
    for (const it of actions) {
      if (it.opened_on === dayDate)
        acts.push({ t: it.title, what: 'Opened', c: C.teal, owner: it.owner_team });
      if (it.started_on === dayDate)
        acts.push({ t: it.title, what: 'Started', c: C.amber, owner: it.owner_team });
      if (it.closed_on === dayDate)
        acts.push({ t: it.title, what: 'Resolved', c: C.green, owner: it.owner_team });
      if (day === 0 && it.id !== 'm03' && it.status === 'done')
        acts.push({ t: it.title, what: 'Resolved', c: C.green, owner: it.owner_team });
    }

    /* 7-day efficiency trend: plant and each line */
    const trendRows: Record<string, number | string>[] = [];
    for (let d = -7; d <= -1; d++) {
      const a = agg(dayKeys(d));
      const row: Record<string, number | string> = {
        label: labelOf(dateFor(d), true),
        date: dateFor(d),
        plant: (a.total.good / a.total.target) * 100,
      };
      for (const l of LINES) {
        let good = 0;
        let target = 0;
        a.per.forEach((p, mi) => {
          if (MACHINES[mi].line === l.key) {
            good += p.good;
            target += p.target;
          }
        });
        row[l.key] = target > 0 ? (good / target) * 100 : 0;
      }
      trendRows.push(row);
    }
    const allV = trendRows.flatMap((r) =>
      ['plant', 'A', 'B', 'C', 'D'].map((k) => r[k] as number)
    );
    const lo = Math.floor(Math.min(...allV) - 1);
    const hi = Math.ceil(Math.max(...allV) + 1);
    const last = trendRows[trendRows.length - 1];

    const legend = [
      { key: 'plant', label: `Plant ${(last.plant as number).toFixed(1)}%` },
      ...LINES.map((l) => ({
        key: l.key,
        label: `Line ${l.key} ${(last[l.key] as number).toFixed(1)}%`,
      })),
    ];

    const worst = perShift.slice().sort((a, b) => a.eff - b.eff)[0];
    const summary =
      `${day === 0 ? 'Today so far' : labelOf(dayDate)}: ` +
      `${pct(total.total.good, total.total.target)} efficiency, ${fmt(
        total.total.lost
      )} units lost (${rsShort(total.total.lost)}). ` +
      `${worst.label} shift was weakest at ${worst.eff.toFixed(1)}%` +
      (top5.length ? `, led by ${top5[0].id} ${top5[0].label.toLowerCase()}.` : '.');

    /* the printable report */
    function reportData(kind: 'daily' | 'shift'): ReportData {
      const isShift = kind === 'shift';
      const si = SHIFT_ORDER.indexOf(repShift);
      const shiftAgg = agg([keys[si]]);
      const src = isShift ? shiftAgg : total;

      const causes = CAUSES.map((c) => ({
        label: c.label,
        units: fmt(src.total.L[c.key]),
        rs: rs(src.total.L[c.key]),
        share:
          src.total.lost > 0
            ? Math.round((src.total.L[c.key] / src.total.lost) * 100) + '%'
            : '—',
        w: src.total.lost > 0 ? (src.total.L[c.key] / src.total.lost) * 100 : 0,
      }));

      const list = isShift ? lossesOf(shiftAgg, repShift) : losses;
      const five = list.slice(0, 5).map((l, i) => ({
        n: i + 1,
        what: `${l.id} · ${l.label}${l.op ? ` · ${l.op}` : ''}`,
        units: fmt(l.v),
        rs: rs(l.v),
      }));

      const dayName = day === 0 ? `${labelOf(dayDate)} (so far)` : labelOf(dayDate);
      const sentence = isShift
        ? `${SHIFTS[repShift].name} (${SHIFTS[
            repShift
          ].label.toLowerCase()}) ran at ${pct(
            shiftAgg.total.good,
            shiftAgg.total.target
          )} and lost ${fmt(shiftAgg.total.lost)} units (${rsShort(shiftAgg.total.lost)})` +
          (five.length
            ? `. Biggest loss: ${five[0].what.split(' · ').slice(0, 2).join(' ')}.`
            : '.')
        : `The plant ran at ${pct(total.total.good, total.total.target)} and lost ${fmt(
            total.total.lost
          )} units (${rsShort(total.total.lost)}). ${worst.label} shift was weakest at ${worst.eff.toFixed(
            1
          )}%.`;

      return {
        title: isShift ? 'Shift report' : 'Daily report',
        sub: isShift
          ? `${dayName} · ${SHIFTS[repShift].name} · ${SHIFTS[repShift].label} · ${SHIFTS[repShift].range}`
          : `${dayName} · All three shifts`,
        sentence,
        k: {
          good: fmt(src.total.good),
          target: fmt(src.total.target),
          eff: pct(src.total.good, src.total.target),
          lost: fmt(src.total.lost),
          rs: rsShort(src.total.lost),
        },
        causes,
        showShifts: !isShift,
        shifts: perShift.map((s) => ({
          name: `${s.name} · ${s.label}`,
          target: fmt(s.agg.total.target),
          good: fmt(s.agg.total.good),
          eff: s.agg.total.target > 0 ? s.eff.toFixed(1) + '%' : '—',
          lost: fmt(s.agg.total.lost),
          rs: rs(s.agg.total.lost),
        })),
        top5: five,
        actions: actions
          .filter((a) => a.status !== 'done')
          .map((a) => ({
            t: a.title,
            owner: a.owner_team,
            due: a.due_date ? labelOf(a.due_date) : '—',
            status: a.status === 'in_progress' ? 'In progress' : 'To do',
            wk: `${rupeesShort(a.rupees_per_week)}/week`,
          })),
        generated: `Generated ${clock(t)} · KeenFlo · ${PLANT_NAME}`,
      };
    }

    return {
      kpis,
      shiftBars,
      top5,
      acts,
      trendRows,
      lo,
      hi,
      legend,
      summary,
      dayTitle:
        day === 0
          ? `Today · ${labelOf(dateFor(0))} (night shift in progress)`
          : labelOf(dayDate),
      markDate: day < 0 ? dateFor(day) : null,
      reportData,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, kf.data, index, day, tm, actions, liveSegments, repShift, t]);

  if (error) {
    return (
      <>
        <TopBar title="Reports" showRange={false} note="Pick a day below" />
        <ErrorCard title="KeenFlo could not build the report" message={error} onRetry={reload} />
      </>
    );
  }
  if (!view) {
    return (
      <>
        <TopBar title="Reports" showRange={false} note="Pick a day below" />
        <Loading what="the reports" />
      </>
    );
  }

  if (report) {
    return <PrintableReport data={view.reportData(report)} onBack={() => setReport(null)} />;
  }

  return (
    <>
      <TopBar title="Reports" showRange={false} note="Pick a day below" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section
          aria-label="Day and downloads"
          style={{
            background: C.white,
            borderRadius: 15,
            boxShadow: CARD_SHADOW,
            padding: '16px 22px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.faint }}>Day</span>
            <div role="group" aria-label="Day" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[-7, -6, -5, -4, -3, -2, -1, 0].map((k) => (
                <Pill
                  key={k}
                  label={k === 0 ? 'Today' : labelOf(dateFor(k), true)}
                  on={day === k}
                  onClick={() => setDay(k)}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <div
              role="group"
              aria-label="Shift for the shift report"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: C.muted,
              }}
            >
              Shift
              {SHIFT_ORDER.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={repShift === k}
                  onClick={() => setRepShift(k)}
                  style={{
                    font: 'inherit',
                    width: 32,
                    height: 32,
                    border: `1px solid ${C.line}`,
                    borderRadius: 9,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: repShift === k ? C.ink : C.white,
                    color: repShift === k ? C.white : C.ink,
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setReport('shift')}
              style={{
                font: 'inherit',
                border: `1px solid ${C.teal}`,
                borderRadius: 12,
                padding: '11px 16px',
                background: C.white,
                color: C.ink,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Download shift report
            </button>
            <button
              type="button"
              onClick={() => setReport('daily')}
              style={{
                font: 'inherit',
                border: 0,
                borderRadius: 12,
                padding: '12px 18px',
                background: C.teal,
                color: C.white,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Download daily report
            </button>
          </div>
        </section>

        <section aria-labelledby="day-h" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 id="day-h" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {view.dayTitle}
          </h2>
          <p
            style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: C.slate }}
            suppressHydrationWarning
          >
            {view.summary}
          </p>
        </section>

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

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 24 }}>
          {/* shift comparison */}
          <section
            aria-labelledby="shc-h"
            style={{ ...card, flex: '5 1 380px', minWidth: 0, gap: 14 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id="shc-h" style={h2}>
                Shift A vs B vs C
              </h2>
              <span style={sub}>Produced against target, units</span>
            </div>
            <div style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={view.shiftBars} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke={C.line} strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: C.slate }}
                    axisLine={{ stroke: C.line }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => Math.round(v / 1000) + 'k'}
                    tick={{ fontSize: 11, fill: C.faint }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    iconType="square"
                    wrapperStyle={{ fontSize: 12, color: C.muted }}
                  />
                  <Bar dataKey="Target" fill={C.line} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  <Bar
                    dataKey="Produced"
                    fill={C.teal}
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex' }}>
              {view.shiftBars.map((sb) => (
                <div
                  key={sb.name}
                  style={{
                    flex: '1 1 0',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    textAlign: 'center',
                  }}
                >
                  <strong style={{ fontSize: 13 }}>{sb.name}</strong>
                  <span style={{ fontSize: 11, color: C.faint }}>{sb.label}</span>
                  <strong style={{ fontSize: 16, color: sb.effC }} suppressHydrationWarning>
                    {sb.eff}
                  </strong>
                  <span style={{ fontSize: 11, color: C.muted }} suppressHydrationWarning>
                    {sb.lost} units lost
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* top 5 losses */}
          <section
            aria-labelledby="t5-h"
            style={{ ...card, flex: '7 1 480px', minWidth: 0, gap: 6 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8 }}>
              <h2 id="t5-h" style={h2}>
                Top 5 losses
              </h2>
              <span style={sub}>By machine and cause</span>
            </div>
            {view.top5.map((t5) => (
              <div
                key={t5.n}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 0',
                  borderTop: `1px solid ${C.hair}`,
                }}
              >
                <span
                  style={{
                    flex: '0 0 auto',
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    background: C.hair,
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {t5.n}
                </span>
                <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14 }}>
                  <strong>{t5.id}</strong> · {t5.label}
                </span>
                <span style={{ fontSize: 13, color: C.muted }} suppressHydrationWarning>
                  {t5.units} units
                </span>
                <strong
                  style={{ fontSize: 14, minWidth: 80, textAlign: 'right' }}
                  suppressHydrationWarning
                >
                  {t5.rs}
                </strong>
              </div>
            ))}
          </section>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 24 }}>
          {/* 7-day trend */}
          <section
            aria-labelledby="tr-h"
            style={{ ...card, flex: '7 1 520px', minWidth: 0, gap: 14 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id="tr-h" style={h2}>
                Efficiency, last 7 days
              </h2>
              <span style={sub}>
                Plant and each line, all shifts. The marker shows the selected day.
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px 16px',
                fontSize: 12,
                color: C.slate,
              }}
            >
              {view.legend.map((lg) => {
                const st = LINE_STYLE[lg.key];
                return (
                  <span key={lg.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 18,
                        height: 0,
                        borderTop: `2.5px ${st.dash ? 'dashed' : 'solid'} ${st.stroke}`,
                      }}
                    />
                    {lg.label}
                  </span>
                );
              })}
            </div>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={view.trendRows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke={C.line} strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: C.faint }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[view.lo, view.hi]}
                    tickFormatter={(v: number) => v.toFixed(0) + '%'}
                    tick={{ fontSize: 11, fill: C.faint }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  {view.markDate ? (
                    <ReferenceArea
                      x1={labelOf(view.markDate, true)}
                      x2={labelOf(view.markDate, true)}
                      fill="rgba(79, 209, 197, 0.12)"
                      strokeOpacity={0}
                    />
                  ) : null}
                  {['C', 'D', 'A', 'B', 'plant'].map((k) => (
                    <Line
                      key={k}
                      type="linear"
                      dataKey={k}
                      stroke={LINE_STYLE[k].stroke}
                      strokeWidth={LINE_STYLE[k].width}
                      strokeDasharray={LINE_STYLE[k].dash}
                      dot={
                        k === 'plant'
                          ? { r: 4, fill: C.white, stroke: C.teal, strokeWidth: 2 }
                          : false
                      }
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* action items on this day */}
          <section
            aria-labelledby="acts-h"
            style={{ ...card, flex: '5 1 360px', minWidth: 0, gap: 10 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 4 }}>
              <h2 id="acts-h" style={h2}>
                Action items opened and closed
              </h2>
              <span style={sub}>On the selected day</span>
            </div>
            {view.acts.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: '10px 0',
                  borderTop: `1px solid ${C.hair}`,
                  fontSize: 14,
                  color: C.muted,
                }}
              >
                No action items were opened or closed on this day.
              </p>
            ) : (
              view.acts.map((ac, i) => (
                <div
                  key={`${ac.t}-${ac.what}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '10px 0',
                    borderTop: `1px solid ${C.hair}`,
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 auto',
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: C.page,
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ width: 7, height: 7, borderRadius: '50%', background: ac.c }}
                    />
                    {ac.what}
                  </span>
                  <span
                    style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14 }}
                  >
                    <strong>{ac.t}</strong>
                    <span style={{ fontSize: 12, color: C.muted }}>Owner: {ac.owner}</span>
                  </span>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </>
  );
}
