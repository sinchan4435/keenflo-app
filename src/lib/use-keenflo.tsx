'use client';

/**
 * One provider holds everything the app screens need:
 *   - the plant data loaded from Supabase
 *   - the live shift clock and simulator
 *   - the date switch
 *   - writes back to Supabase, with Realtime so other viewers see them
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Aggregate,
  LiveContext,
  PlantIndex,
  Scope,
  aggregate,
  buildIndex,
  statsFromDb,
} from './analytics';
import { SHIFT_MINUTES, SHIFT_ORDER, ShiftCode } from './config';
import { addDays, daysBetween, istToday } from './dates';
import { LINE_C_IDS, MACHINES } from './plant';
import { Segment } from './sim-core';
import {
  END_SECONDS,
  LIVE_SHIFT,
  Speed,
  TICK_MS,
  buildLiveBaseline,
  buildLiveShift,
  fixesFor,
  initialLiveState,
  shiftMinute,
  tick,
} from './simulator';
import { MISSING_ENV_MESSAGE, fetchAll, getSupabase } from './supabase';
import {
  ActionItemRow,
  ActionStatus,
  DowntimeRowDb,
  HourlyRow,
  LineRow,
  MachineRow,
  OperatorRow,
  PlantData,
  ShiftAssignmentRow,
} from './types';

export type DateRange = 'today' | 'yesterday' | 'week';

type Ctx = {
  loading: boolean;
  error: string | null;
  reload: () => void;

  data: PlantData | null;
  index: PlantIndex;

  /** Live shift clock, in seconds since 22:00. */
  t: number;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  resetShift: () => void;
  /** Shift minute, 0..480. */
  tm: number;
  shiftEnded: boolean;
  /** Tonight's segments, with any fixes applied. */
  liveSegments: Segment[][];
  /** Tonight's segments with nothing fixed. Used to measure what a fix saved. */
  liveBaseline: Segment[][];
  live: LiveContext;
  fixedAt: Record<string, number>;

  range: DateRange;
  setRange: (r: DateRange) => void;

  /** 'YYYY-MM-DD' for a day offset. 0 = today, -1 = yesterday. */
  dateFor: (offset: number) => string;
  /** How many days before today a date is. Today = 0. */
  offsetOf: (date: string) => number;
  /** Which shifts of a day are in the database. */
  dbShiftsFor: (offset: number) => ShiftCode[];
  /** Scope list for the current date range. */
  scopeKeys: (range: DateRange, shifts?: ShiftCode[]) => Scope[];
  /** The period the current range is compared against. */
  compareKeys: (range: DateRange) => Scope[];
  rangeText: (range: DateRange) => { scope: string; vs: string };
  /** Scope list for one calendar day, live shift included when it is today. */
  dayKeys: (offset: number) => Scope[];
  agg: (scopes: Scope[], fromMinute?: number, toMinute?: number) => Aggregate;

  actions: ActionItemRow[];
  setActionStatus: (id: string, status: ActionStatus) => Promise<void>;
  acknowledgeDowntime: (id: string) => Promise<void>;
  /** Items that are not done yet. */
  openActions: () => ActionItemRow[];

  writeError: string | null;
};

const KeenFloContext = createContext<Ctx | null>(null);

const EMPTY_INDEX: PlantIndex = {
  hourly: new Map(),
  downtime: new Map(),
  dates: [],
  fullDates: new Set(),
};

export function KeenFloProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<PlantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [t, setT] = useState(initialLiveState.t);
  const [speed, setSpeed] = useState<Speed>(initialLiveState.speed);
  const [fixedAt, setFixedAt] = useState<Record<string, number>>({});
  const [range, setRange] = useState<DateRange>('today');

  const baseline = useRef<Segment[][] | null>(null);
  if (baseline.current === null) baseline.current = buildLiveBaseline();

  /* ---------------- load ---------------- */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const db = getSupabase();
      if (!db) {
        if (!cancelled) {
          setError(MISSING_ENV_MESSAGE);
          setLoading(false);
        }
        return;
      }

      try {
        const [lines, machines, operators, assignments, hourly, downtime, actions] =
          await Promise.all([
            fetchAll<LineRow>((a, b) => db.from('lines').select('*').range(a, b)),
            fetchAll<MachineRow>((a, b) => db.from('machines').select('*').range(a, b)),
            fetchAll<OperatorRow>((a, b) => db.from('operators').select('*').range(a, b)),
            fetchAll<ShiftAssignmentRow>((a, b) =>
              db.from('shift_assignments').select('*').range(a, b)
            ),
            fetchAll<HourlyRow>((a, b) =>
              db.from('hourly_output').select('*').order('id').range(a, b)
            ),
            fetchAll<DowntimeRowDb>((a, b) =>
              db.from('downtime_events').select('*').order('start_at').range(a, b)
            ),
            fetchAll<ActionItemRow>((a, b) =>
              db.from('action_items').select('*').order('sort_order').range(a, b)
            ),
          ]);

        if (cancelled) return;

        if (machines.length === 0 || hourly.length === 0) {
          setError(
            'The database is empty. Run the schema in supabase/schema.sql, then run `npm run seed`.'
          );
          setLoading(false);
          return;
        }

        const dates = Array.from(new Set(hourly.map((r) => r.date))).sort();
        setData({
          lines,
          machines,
          operators,
          assignments,
          hourly,
          downtime,
          actions,
          today: dates[dates.length - 1] ?? istToday(),
        });
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? `Could not load data from Supabase: ${e.message}`
            : 'Could not load data from Supabase.'
        );
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  /* ---------------- live clock ---------------- */

  useEffect(() => {
    const id = setInterval(() => setT((prev) => tick(prev, speed)), TICK_MS);
    return () => clearInterval(id);
  }, [speed]);

  /* ---------------- realtime ---------------- */

  useEffect(() => {
    const db = getSupabase();
    if (!db || !data) return;

    const channel = db
      .channel('keenflo-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'action_items' },
        (payload) => {
          const row = payload.new as ActionItemRow;
          setData((prev) =>
            prev
              ? { ...prev, actions: prev.actions.map((a) => (a.id === row.id ? { ...a, ...row } : a)) }
              : prev
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'downtime_events' },
        (payload) => {
          const row = payload.new as DowntimeRowDb;
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  downtime: prev.downtime.map((d) => (d.id === row.id ? { ...d, ...row } : d)),
                }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
    // Only re-subscribe when the dataset identity changes, not on every row edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data !== null]);

  /* ---------------- derived ---------------- */

  const index = useMemo(
    () => (data ? buildIndex(data.hourly, data.downtime) : EMPTY_INDEX),
    [data]
  );

  const liveSegments = useMemo(
    () => buildLiveShift(baseline.current as Segment[][], fixedAt),
    [fixedAt]
  );

  const tm = shiftMinute(t);
  const live: LiveContext = useMemo(
    () => ({ segments: liveSegments, fixRejAt: fixesFor(fixedAt).rej ?? null }),
    [liveSegments, fixedAt]
  );

  const today = data?.today ?? istToday();

  const dateFor = useCallback((offset: number) => addDays(today, offset), [today]);
  const offsetOf = useCallback((date: string) => daysBetween(today, date), [today]);

  const dbShiftsFor = useCallback(
    (offset: number): ShiftCode[] => {
      const date = addDays(today, offset);
      return SHIFT_ORDER.filter((sh) =>
        MACHINES.some((m) => index.hourly.has(`${date}|${sh}|${m.id}`))
      );
    },
    [today, index]
  );

  const scopeKeys = useCallback(
    (r: DateRange, shifts?: ShiftCode[]): Scope[] => {
      const want = shifts ?? SHIFT_ORDER;
      const out: Scope[] = [];
      if (r === 'today') {
        for (const sh of want) {
          if (sh === LIVE_SHIFT) out.push({ kind: 'live', upToMinute: tm });
          else out.push({ kind: 'db', date: dateFor(0), shift: sh });
        }
      } else if (r === 'yesterday') {
        for (const sh of want) out.push({ kind: 'db', date: dateFor(-1), shift: sh });
      } else {
        for (let d = -7; d <= -1; d++)
          for (const sh of want) out.push({ kind: 'db', date: dateFor(d), shift: sh });
      }
      return out;
    },
    [dateFor, tm]
  );

  const compareKeys = useCallback(
    (r: DateRange): Scope[] => {
      if (r === 'today')
        return [
          { kind: 'db', date: dateFor(-1), shift: 'A' },
          { kind: 'db', date: dateFor(-1), shift: 'B' },
          { kind: 'db', date: dateFor(-1), shift: 'C', upToMinute: tm },
        ];
      if (r === 'yesterday')
        return SHIFT_ORDER.map((sh) => ({ kind: 'db' as const, date: dateFor(-2), shift: sh }));
      const out: Scope[] = [];
      for (let d = -14; d <= -8; d++)
        for (const sh of SHIFT_ORDER) out.push({ kind: 'db', date: dateFor(d), shift: sh });
      return out;
    },
    [dateFor, tm]
  );

  const dayKeys = useCallback(
    (offset: number): Scope[] => {
      if (offset === 0)
        return [
          { kind: 'db', date: dateFor(0), shift: 'A' },
          { kind: 'db', date: dateFor(0), shift: 'B' },
          { kind: 'live', upToMinute: tm },
        ];
      return SHIFT_ORDER.map((sh) => ({ kind: 'db' as const, date: dateFor(offset), shift: sh }));
    },
    [dateFor, tm]
  );

  const agg = useCallback(
    (scopes: Scope[], fromMinute = 0, toMinute = SHIFT_MINUTES) =>
      aggregate(index, scopes, live, fromMinute, toMinute),
    [index, live]
  );

  const rangeText = useCallback(
    (r: DateRange) => {
      if (r === 'today') return { scope: 'Today so far', vs: 'vs same time yesterday' };
      if (r === 'yesterday')
        return { scope: labelOf(dateFor(-1)), vs: 'vs the day before' };
      return {
        scope: `${labelOf(dateFor(-7), true)} – ${labelOf(dateFor(-1))}`,
        vs: 'vs previous 7 days',
      };
    },
    [dateFor]
  );

  /* ---------------- writes ---------------- */

  const setActionStatus = useCallback(
    async (id: string, status: ActionStatus) => {
      setWriteError(null);

      // When a problem is marked resolved, the live shift stops losing output
      // to it from this minute on.
      setFixedAt((prev) => {
        const next = { ...prev };
        if (status === 'done' && id !== 'm03') next[id] = tm;
        else delete next[id];
        return next;
      });

      // Optimistic, so the board moves straight away.
      const resolvedAt = status === 'done' ? new Date().toISOString() : null;
      setData((prev) =>
        prev
          ? {
              ...prev,
              actions: prev.actions.map((a) =>
                a.id === id ? { ...a, status, resolved_at: resolvedAt } : a
              ),
            }
          : prev
      );

      const db = getSupabase();
      if (!db) return;
      const { error: e } = await db
        .from('action_items')
        .update({ status, resolved_at: resolvedAt })
        .eq('id', id);
      if (e) setWriteError(`Could not save that change: ${e.message}`);
    },
    [tm]
  );

  const acknowledgeDowntime = useCallback(async (id: string) => {
    setWriteError(null);
    setData((prev) =>
      prev
        ? {
            ...prev,
            downtime: prev.downtime.map((d) =>
              d.id === id ? { ...d, status: 'acknowledged' } : d
            ),
          }
        : prev
    );
    const db = getSupabase();
    if (!db) return;
    const { error: e } = await db
      .from('downtime_events')
      .update({ status: 'acknowledged' })
      .eq('id', id);
    if (e) setWriteError(`Could not acknowledge that event: ${e.message}`);
  }, []);

  const actions = useMemo(() => data?.actions ?? [], [data]);
  const openActions = useCallback(
    () => actions.filter((a) => a.status !== 'done'),
    [actions]
  );

  const resetShift = useCallback(() => {
    setFixedAt((prev) => {
      const next: Record<string, number> = {};
      for (const k in prev) next[k] = 0;
      return next;
    });
    setT(0);
  }, []);

  const value: Ctx = {
    loading,
    error,
    reload: () => setNonce((n) => n + 1),
    data,
    index,
    t,
    speed,
    setSpeed,
    resetShift,
    tm,
    shiftEnded: t >= END_SECONDS,
    liveSegments,
    liveBaseline: baseline.current as Segment[][],
    live,
    fixedAt,
    range,
    setRange,
    dateFor,
    offsetOf,
    dbShiftsFor,
    scopeKeys,
    compareKeys,
    rangeText,
    dayKeys,
    agg,
    actions,
    setActionStatus,
    acknowledgeDowntime,
    openActions,
    writeError,
  };

  return <KeenFloContext.Provider value={value}>{children}</KeenFloContext.Provider>;
}

export function useKeenFlo(): Ctx {
  const ctx = useContext(KeenFloContext);
  if (!ctx) throw new Error('useKeenFlo must be used inside <KeenFloProvider>');
  return ctx;
}

/* ------------------------------------------------------------------ */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Wed 21 Oct', or 'Wed 21' when short. */
export function labelOf(isoDate: string, short = false): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  const w = WEEKDAYS[d.getUTCDay()];
  return short ? `${w} ${d.getUTCDate()}` : `${w} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export { LINE_C_IDS, statsFromDb };
