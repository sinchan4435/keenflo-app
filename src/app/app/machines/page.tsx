'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useMemo, useState } from 'react';

import MachineDrawer from '@/components/MachineDrawer';
import TopBar from '@/components/TopBar';
import { C, CARD_SHADOW, ErrorCard, Loading, Pill, Select } from '@/components/ui';
import { topIssue } from '@/lib/analytics';
import { CAUSES, CauseKey, MachineState, STATE_STYLE } from '@/lib/config';
import { fmt, pct } from '@/lib/format';
import { LINES, MACHINES, initials } from '@/lib/plant';
import { currentSegment, statsFor } from '@/lib/sim-core';
import { useKeenFlo } from '@/lib/use-keenflo';

type SortKey = 'worst' | 'best' | 'lost' | 'id';

const STATUS_OPTIONS = [
  { v: 'all', l: 'All statuses' },
  { v: 'attention', l: 'Needs attention' },
  { v: 'run', l: 'Running' },
  { v: 'slow', l: 'Slow' },
  { v: 'co', l: 'Changeover' },
  { v: 'stop', l: 'Stopped' },
  { v: 'idle', l: 'Idle' },
];

const SORT_OPTIONS = [
  { v: 'worst', l: 'Worst efficiency first' },
  { v: 'best', l: 'Best efficiency first' },
  { v: 'lost', l: 'Most units lost' },
  { v: 'id', l: 'Machine ID' },
];

function MachinesInner() {
  const kf = useKeenFlo();
  const router = useRouter();
  const params = useSearchParams();
  const { loading, error, reload, agg, scopeKeys, rangeText, range, tm, liveSegments, index } = kf;

  const [line, setLine] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<SortKey>('worst');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const causeParam = params.get('cause');
  const cause: CauseKey | null = CAUSES.some((c) => c.key === causeParam)
    ? (causeParam as CauseKey)
    : null;

  const view = useMemo(() => {
    if (loading || error || !kf.data) return null;

    const cur = agg(scopeKeys(range));
    const rt = rangeText(range);

    // When a cause is picked on Overview, show only the machines behind it.
    const highlighted = new Set<number>();
    if (cause && cur.total.L[cause] > 0) {
      cur.per.forEach((p, mi) => {
        if (p.L[cause] / cur.total.L[cause] >= 0.12) highlighted.add(mi);
      });
    }

    const q = query.trim().toLowerCase();

    const cards = MACHINES.map((m, mi) => {
      const segs = liveSegments[mi];
      const now = currentSegment(segs, tm);
      const lastHour = statsFor(mi, segs, Math.max(0, tm - 60), tm, kf.live.fixRejAt);
      const s = cur.per[mi];
      const effV = s.target > 0 ? (s.good / s.target) * 100 : null;
      const iss = topIssue(s);
      const style = STATE_STYLE[now.st];
      const attention =
        (now.st !== 'run' && now.st !== 'idle') || (effV != null && effV < 87);

      return {
        mi,
        m,
        state: now.st as MachineState,
        effV,
        lostV: s.lost,
        attention,
        id: m.id,
        type: m.type,
        op: m.ops.C,
        ini: initials(m.ops.C),
        word: style.word,
        sc: style.c,
        tint: style.tint,
        out: fmt(lastHour.good),
        tgt: now.st === 'idle' && lastHour.target === 0 ? '—' : fmt(lastHour.target),
        barW: lastHour.target > 0 ? Math.min(100, (lastHour.good / lastHour.target) * 100) : 0,
        eff: effV == null ? '—' : effV.toFixed(1) + '%',
        issue: iss.label,
        edge: attention ? (now.st === 'run' ? C.amber : style.c) : 'transparent',
      };
    });

    const filtered = cards.filter((c) => {
      if (line !== 'all' && c.m.line !== line) return false;
      if (status === 'attention' && !c.attention) return false;
      if (status !== 'all' && status !== 'attention' && c.state !== status) return false;
      if (cause && !highlighted.has(c.mi)) return false;
      if (
        q &&
        !(
          c.id.toLowerCase().includes(q) ||
          c.type.toLowerCase().includes(q) ||
          c.op.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });

    const sorters: Record<SortKey, (a: (typeof cards)[0], b: (typeof cards)[0]) => number> = {
      worst: (a, b) => (a.effV ?? 999) - (b.effV ?? 999),
      best: (a, b) => (b.effV ?? -1) - (a.effV ?? -1),
      lost: (a, b) => b.lostV - a.lostV,
      id: (a, b) => a.id.localeCompare(b.id),
    };

    const groups = LINES.map((l) => {
      const ms = filtered.filter((c) => c.m.line === l.key).sort(sorters[sort]);
      let good = 0;
      let target = 0;
      cur.per.forEach((p, mi) => {
        if (MACHINES[mi].line === l.key) {
          good += p.good;
          target += p.target;
        }
      });
      return {
        key: l.key,
        name: l.name,
        desc: l.desc,
        eff: pct(good, target),
        count: `${ms.length} ${ms.length === 1 ? 'machine' : 'machines'}`,
        machines: ms,
      };
    }).filter((g) => g.machines.length > 0);

    return {
      groups,
      shown: `${filtered.length} of ${MACHINES.length} machines`,
      scope: rt.scope,
      causeLabel: cause ? CAUSES.find((c) => c.key === cause)!.label : '',
      causeN: `${highlighted.size} ${highlighted.size === 1 ? 'machine' : 'machines'}`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, kf.data, tm, range, index, liveSegments, line, status, sort, query, cause]);

  if (error) {
    return (
      <>
        <TopBar title="Machines" />
        <ErrorCard title="KeenFlo could not load the machines" message={error} onRetry={reload} />
      </>
    );
  }
  if (!view) {
    return (
      <>
        <TopBar title="Machines" />
        <Loading what="the machines" />
      </>
    );
  }

  return (
    <>
      <TopBar title="Machines" />

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.faint }}>Line</span>
            <div role="group" aria-label="Line" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['all', 'A', 'B', 'C', 'D'].map((k) => (
                <Pill
                  key={k}
                  label={k === 'all' ? 'All lines' : `Line ${k}`}
                  on={line === k}
                  onClick={() => setLine(k)}
                />
              ))}
            </div>
          </div>

          <Select label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <Select
            label="Sort by"
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={SORT_OPTIONS}
            minWidth={190}
          />

          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: C.faint,
              flex: '1 1 200px',
            }}
          >
            Search
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Machine, type or operator"
              style={{
                font: 'inherit',
                fontSize: 13,
                fontWeight: 500,
                color: C.ink,
                background: C.white,
                border: `1px solid ${C.line}`,
                borderRadius: 12,
                padding: '9px 12px',
                minWidth: 0,
              }}
            />
          </label>

          <span style={{ fontSize: 12, color: C.muted, paddingBottom: 10 }}>
            {view.shown} · efficiency and top issue for {view.scope}
          </span>
        </section>

        {cause ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
              background: C.white,
              borderRadius: 15,
              boxShadow: CARD_SHADOW,
              padding: '12px 22px',
              fontSize: 13,
            }}
          >
            <span>
              Showing the {view.causeN} behind <strong>{view.causeLabel}</strong>
            </span>
            <button
              type="button"
              onClick={() => router.push('/app/machines')}
              style={{
                font: 'inherit',
                border: 0,
                borderRadius: 10,
                padding: '7px 12px',
                background: C.hair,
                color: C.ink,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Show all machines
            </button>
          </div>
        ) : null}

        {view.groups.length === 0 ? (
          <p
            style={{
              margin: 0,
              background: C.white,
              borderRadius: 15,
              padding: 22,
              fontSize: 14,
              color: C.muted,
            }}
          >
            No machines match these filters.
          </p>
        ) : (
          view.groups.map((gp) => (
            <section key={gp.key} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{gp.name}</h2>
                  <span style={{ fontSize: 13, color: C.muted }}>
                    {gp.desc} · {gp.count}
                  </span>
                </div>
                <span style={{ fontSize: 13, color: C.muted }}>
                  Line efficiency{' '}
                  <strong style={{ color: C.ink, fontSize: 15 }}>{gp.eff}</strong>
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
                  gap: 24,
                }}
              >
                {gp.machines.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="kf-machine-card"
                    onClick={() => setSelected(c.mi)}
                    aria-label={`${c.id}, ${c.type}, ${c.word}, operator ${c.op}. Open details.`}
                    style={{
                      font: 'inherit',
                      position: 'relative',
                      overflow: 'hidden',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: C.white,
                      color: C.ink,
                      border: 0,
                      borderRadius: 15,
                      boxShadow: CARD_SHADOW,
                      padding: '20px 22px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      minWidth: 0,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 4,
                        background: c.edge,
                      }}
                    />
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 8,
                        width: '100%',
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          minWidth: 0,
                        }}
                      >
                        <strong style={{ fontSize: 15, fontWeight: 700 }}>{c.id}</strong>
                        <span style={{ fontSize: 12, color: C.muted }}>{c.type}</span>
                      </span>
                      <span
                        suppressHydrationWarning
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 10px',
                          borderRadius: 999,
                          background: c.tint,
                          fontSize: 11,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: c.sc,
                          }}
                        />
                        {c.word}
                      </span>
                    </span>

                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: C.hair,
                          color: C.slate,
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: '0 0 auto',
                        }}
                      >
                        {c.ini}
                      </span>
                      {c.op}
                    </span>

                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.faint }}>
                        OUTPUT THIS HOUR
                      </span>
                      <span style={{ fontSize: 22, fontWeight: 700 }} suppressHydrationWarning>
                        {c.out}{' '}
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.faint }}>
                          / {c.tgt}
                        </span>
                      </span>
                    </span>

                    <span
                      style={{
                        display: 'block',
                        width: '100%',
                        height: 5,
                        background: C.hair,
                        borderRadius: 3,
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          height: 5,
                          borderRadius: 3,
                          width: `${c.barW}%`,
                          background: C.teal,
                        }}
                      />
                    </span>

                    <span
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto minmax(0, 1fr)',
                        gap: '4px 12px',
                        fontSize: 12,
                        width: '100%',
                      }}
                    >
                      <span style={{ color: C.faint, fontWeight: 700 }}>Efficiency</span>
                      <strong style={{ textAlign: 'right' }} suppressHydrationWarning>
                        {c.eff}
                      </strong>
                      <span style={{ color: C.faint, fontWeight: 700 }}>Top issue</span>
                      <span style={{ textAlign: 'right' }} suppressHydrationWarning>
                        {c.issue}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {selected != null ? (
        <MachineDrawer machineIndex={selected} onClose={() => setSelected(null)} />
      ) : null}
    </>
  );
}

export default function MachinesPage() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar title="Machines" />
          <Loading what="the machines" />
        </>
      }
    >
      <MachinesInner />
    </Suspense>
  );
}
