'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo } from 'react';

import { startMinuteOf, topIssue } from '@/lib/analytics';
import { CAUSES, MachineState, RATED_PER_HOUR, SHIFTS, SHIFT_ORDER, STATE_STYLE } from '@/lib/config';
import { dur, fmt, hm, pct, rs } from '@/lib/format';
import { LINES, MACHINES, initials } from '@/lib/plant';
import { Segment, currentSegment, statsFor } from '@/lib/sim-core';
import { labelOf, useKeenFlo } from '@/lib/use-keenflo';
import { C } from './ui';

const SEG_BG: Record<MachineState, string> = {
  run: C.green,
  slow: C.amber,
  co: 'repeating-linear-gradient(135deg, #ED8936 0 3px, #FBD38D 3px 6px)',
  stop: C.red,
  idle: C.grey,
};

const panel: React.CSSProperties = {
  background: C.white,
  borderRadius: 15,
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const h3: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };

export default function MachineDrawer({
  machineIndex,
  onClose,
}: {
  machineIndex: number;
  onClose: () => void;
}) {
  const kf = useKeenFlo();
  const router = useRouter();
  const { tm, liveSegments, live, index, dateFor, actions } = kf;
  const m = MACHINES[machineIndex];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const v = useMemo(() => {
    const segs: Segment[] = liveSegments[machineIndex];
    const cur = currentSegment(segs, tm);
    const style = STATE_STYLE[cur.st];
    const s = statsFor(machineIndex, segs, 0, tm, live.fixRejAt);

    /* timeline: merge touching segments of the same state */
    const merged: { st: MachineState; s: number; e: number }[] = [];
    for (const g of segs) {
      if (g.s >= tm) break;
      const e = Math.min(g.e, tm);
      const last = merged[merged.length - 1];
      if (last && last.st === g.st && Math.abs(last.e - g.s) < 1e-6) last.e = e;
      else merged.push({ st: g.st, s: g.s, e });
    }

    /* output per hour */
    const hours: { h: number; label: string; val: string; partial: boolean }[] = [];
    for (let i = 0; i < 8; i++) {
      const a = i * 60;
      const b = Math.min(tm, a + 60);
      const w = b > a ? statsFor(machineIndex, segs, a, b, live.fixRejAt) : null;
      const value = w ? w.good : 0;
      hours.push({
        h: Math.min(100, (value / 2200) * 100),
        label: hm(a).slice(0, 2),
        val: w ? fmt(value) : '',
        partial: b - a < 60,
      });
    }

    const maxLoss = Math.max(1, s.L.stop, s.L.slow, s.L.co, s.L.rej);
    const breakdown = CAUSES.map((c) => ({
      label: c.label,
      units: fmt(s.L[c.key]),
      rs: rs(s.L[c.key]),
      w: (s.L[c.key] / maxLoss) * 100,
    }));

    /* last 5 downtime events: tonight first, then the database */
    type Ev = { when: string; dur: string; cause: string };
    const evs: Ev[] = [];
    const tonight = segs.filter((g) => (g.st === 'stop' || g.st === 'co') && g.s < tm);
    for (let k = tonight.length - 1; k >= 0 && evs.length < 5; k--) {
      const g = tonight[k];
      evs.push({
        when: `Tonight · ${hm(g.s)}`,
        dur: dur(Math.max(1, Math.min(g.e, tm) - g.s)),
        cause: g.st === 'co' ? 'Setup/changeover' : g.reason,
      });
    }
    const past: { date: string; shift: typeof SHIFT_ORDER[number] }[] = [
      { date: dateFor(-1), shift: 'C' },
      { date: dateFor(-1), shift: 'B' },
      { date: dateFor(-1), shift: 'A' },
      { date: dateFor(-2), shift: 'C' },
    ];
    for (const p of past) {
      if (evs.length >= 5) break;
      const rows = (index.downtime.get(`${p.date}|${p.shift}|${m.id}`) ?? [])
        .slice()
        .sort((a, b) => startMinuteOf(b) - startMinuteOf(a));
      for (const e of rows) {
        if (evs.length >= 5) break;
        evs.push({
          when: `${labelOf(p.date, true)} · ${SHIFTS[p.shift].name} · ${hm(
            startMinuteOf(e),
            p.shift
          )}`,
          dur: dur(Math.max(1, Number(e.duration_min))),
          cause: e.cause === 'Short stops' ? `Short stops × ${e.occurrences}` : e.cause,
        });
      }
    }

    /* tonight vs last night, same window */
    const yesterday = kf.agg(
      [{ kind: 'db', date: dateFor(-1), shift: 'C', upToMinute: tm }],
      0,
      tm
    ).per[machineIndex];
    const dtMinutes = (o: typeof s) => Object.values(o.dt).reduce((a, b) => a + b, 0);
    const cmp = [
      { label: 'Efficiency', a: pct(s.good, s.target), b: pct(yesterday.good, yesterday.target) },
      { label: 'Units lost', a: fmt(s.lost), b: fmt(yesterday.lost) },
      { label: '₹ lost', a: rs(s.lost), b: rs(yesterday.lost) },
      { label: 'Stops', a: String(s.stopN), b: String(Math.round(yesterday.stopN)) },
      { label: 'Downtime', a: dur(dtMinutes(s)), b: dur(dtMinutes(yesterday)) },
    ];

    const item = actions.find((a) => a.machines.includes(m.id) && a.status !== 'done');

    return {
      title: `${m.id} · ${m.type}`,
      sub: `Line ${m.line} · Operator ${m.ops.C}`,
      ini: initials(m.ops.C),
      style,
      since: `since ${hm(cur.s)}`,
      eff: pct(s.good, s.target),
      good: fmt(s.good),
      target: fmt(s.target),
      lost: fmt(s.lost),
      rs: rs(s.lost),
      issue: topIssue(s).label,
      timeline: merged.map((g) => ({
        left: (g.s / 480) * 100,
        width: ((g.e - g.s) / 480) * 100,
        bg: SEG_BG[g.st],
      })),
      now: (tm / 480) * 100,
      hours,
      breakdown,
      events: evs,
      cmp,
      cmpNote: `Tonight vs last night, both 22:00 to ${hm(tm)}`,
      item,
    };
  }, [machineIndex, tm, liveSegments, live, index, dateFor, actions, m, kf]);

  const lineName = LINES.find((l) => l.key === m.line)?.name ?? m.line;

  return (
    <>
      <button
        type="button"
        aria-label="Close machine details"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          border: 0,
          padding: 0,
          background: 'rgba(21, 25, 40, 0.35)',
          cursor: 'pointer',
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={v.title}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          width: 'min(540px, 100%)',
          boxSizing: 'border-box',
          background: C.page,
          overflowY: 'auto',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          boxShadow: '-8px 0 30px rgba(21, 25, 40, 0.12)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{v.title}</h2>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: C.slate,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: C.hair,
                  color: C.slate,
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {v.ini}
              </span>
              {v.sub}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px',
                  borderRadius: 999,
                  background: v.style.tint,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 7, height: 7, borderRadius: '50%', background: v.style.c }}
                />
                {v.style.word}
              </span>
              <span style={{ fontSize: 12, color: C.muted }}>{v.since}</span>
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              font: 'inherit',
              width: 40,
              height: 40,
              flex: '0 0 auto',
              border: 0,
              borderRadius: 12,
              background: C.white,
              boxShadow: '0 3.5px 5.5px rgba(0, 0, 0, 0.04)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke={C.ink}
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* four numbers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          {[
            { label: 'Efficiency tonight', value: v.eff, extra: null as string | null },
            {
              label: 'Produced / target',
              value: v.good,
              suffix: ` / ${v.target}`,
              extra: null as string | null,
            },
            { label: 'Units lost', value: v.lost, extra: null as string | null },
            { label: '₹ lost · top issue', value: v.rs, extra: v.issue },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                background: C.white,
                borderRadius: 15,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: C.faint }}>{k.label}</span>
              <strong style={{ fontSize: 20 }}>
                {k.value}
                {'suffix' in k && k.suffix ? (
                  <span style={{ fontSize: 12, color: C.faint }}>{k.suffix}</span>
                ) : null}
              </strong>
              {k.extra ? <span style={{ fontSize: 12, color: C.muted }}>{k.extra}</span> : null}
            </div>
          ))}
        </div>

        {/* timeline */}
        <section style={panel}>
          <h3 style={h3}>Shift timeline</h3>
          <div
            role="img"
            aria-label="Timeline of machine states through the night shift"
            style={{
              position: 'relative',
              height: 30,
              background: C.hair,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {v.timeline.map((sg, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${sg.left}%`,
                  width: `${sg.width}%`,
                  background: sg.bg,
                }}
              />
            ))}
            <span
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${v.now}%`,
                width: 2,
                background: C.ink,
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: C.faint,
            }}
          >
            {['22:00', '00:00', '02:00', '04:00', '06:00'].map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px 14px',
              fontSize: 12,
              color: C.slate,
            }}
          >
            {(
              [
                ['Running', C.green],
                ['Slow', C.amber],
                ['Changeover', 'repeating-linear-gradient(135deg, #ED8936 0 2px, #FBD38D 2px 4px)'],
                ['Stopped', C.red],
                ['Idle', C.grey],
              ] as const
            ).map(([label, bg]) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  aria-hidden="true"
                  style={{ width: 12, height: 10, borderRadius: 3, background: bg }}
                />
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* output per hour */}
        <section style={panel}>
          <h3 style={h3}>Output per hour</h3>
          <div
            role="img"
            aria-label={`Bar chart of units produced each hour against the ${RATED_PER_HOUR} per hour target`}
            style={{
              position: 'relative',
              height: 120,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              borderBottom: `1px solid ${C.line}`,
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: '90.9%',
                borderTop: `1.5px dashed ${C.faint}`,
              }}
            />
            <span
              style={{
                position: 'absolute',
                right: 0,
                bottom: 'calc(90.9% + 3px)',
                fontSize: 10,
                color: C.muted,
              }}
            >
              Target {fmt(RATED_PER_HOUR)}
            </span>
            {v.hours.map((hb, i) => (
              <span
                key={i}
                title={hb.val}
                style={{
                  flex: '1 1 0',
                  height: `${hb.h}%`,
                  background: hb.partial ? 'rgba(79, 209, 197, 0.45)' : C.teal,
                  borderRadius: '5px 5px 0 0',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {v.hours.map((hb, i) => (
              <span
                key={i}
                style={{ flex: '1 1 0', textAlign: 'center', fontSize: 11, color: C.faint }}
              >
                {hb.label}
              </span>
            ))}
          </div>
        </section>

        {/* breakdown */}
        <section style={{ ...panel, gap: 12 }}>
          <h3 style={h3}>Where this machine&rsquo;s output went</h3>
          {v.breakdown.map((bd) => (
            <div key={bd.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontSize: 13,
                }}
              >
                <span>{bd.label}</span>
                <span>
                  {bd.units} units · <strong>{bd.rs}</strong>
                </span>
              </div>
              <div style={{ height: 7, background: C.hair, borderRadius: 4 }}>
                <div
                  style={{
                    height: 7,
                    width: `${bd.w}%`,
                    background: C.teal,
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
          ))}
        </section>

        {/* comparison */}
        <section style={panel}>
          <h3 style={h3}>Tonight vs last night</h3>
          <span style={{ fontSize: 12, color: C.muted }}>{v.cmpNote}</span>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: '0.04em',
                  textAlign: 'right',
                }}
              >
                <th
                  scope="col"
                  style={{ textAlign: 'left', padding: '6px 0', borderBottom: `1px solid ${C.line}` }}
                />
                <th scope="col" style={{ padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>
                  TONIGHT
                </th>
                <th scope="col" style={{ padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>
                  LAST NIGHT
                </th>
              </tr>
            </thead>
            <tbody>
              {v.cmp.map((cm) => (
                <tr key={cm.label}>
                  <th
                    scope="row"
                    style={{
                      textAlign: 'left',
                      fontWeight: 500,
                      padding: '8px 0',
                      borderBottom: `1px solid ${C.hair}`,
                    }}
                  >
                    {cm.label}
                  </th>
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      padding: '8px 0',
                      borderBottom: `1px solid ${C.hair}`,
                    }}
                  >
                    {cm.a}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      color: C.muted,
                      padding: '8px 0',
                      borderBottom: `1px solid ${C.hair}`,
                    }}
                  >
                    {cm.b}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* recent downtime */}
        <section style={{ ...panel, gap: 6 }}>
          <h3 style={{ ...h3, margin: '0 0 4px' }}>Last 5 downtime events</h3>
          {v.events.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>No downtime recorded.</p>
          ) : (
            v.events.map((ev, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  borderTop: `1px solid ${C.hair}`,
                  fontSize: 13,
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <strong>{ev.cause}</strong>
                  <span style={{ fontSize: 12, color: C.muted }}>{ev.when}</span>
                </span>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{ev.dur}</span>
              </div>
            ))
          )}
        </section>

        {v.item ? (
          <section
            style={{
              background: 'linear-gradient(81.62deg, #313860 2.25%, #151928 79.87%)',
              color: C.white,
              borderRadius: 15,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <span
              style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255, 255, 255, 0.72)' }}
            >
              OPEN ACTION ITEM · {v.item.status === 'in_progress' ? 'In progress' : 'To do'}
            </span>
            <strong style={{ fontSize: 16 }}>{v.item.title}</strong>
            <span style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.8)' }}>
              Owner: {v.item.owner_team} · Due{' '}
              {v.item.due_date ? labelOf(v.item.due_date) : '—'}
            </span>
            <button
              type="button"
              onClick={() => router.push(`/app/actions?focus=${v.item!.id}`)}
              style={{
                font: 'inherit',
                alignSelf: 'flex-start',
                border: 0,
                borderRadius: 12,
                padding: '10px 16px',
                background: C.teal,
                color: C.white,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Open action item
            </button>
          </section>
        ) : null}

        <span style={{ fontSize: 11, color: C.faint }}>
          {lineName} · rated {fmt(m.ratedPerHour)} units/hour
        </span>
      </aside>
    </>
  );
}
