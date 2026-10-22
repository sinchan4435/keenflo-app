/**
 * KeenFlo constants. These mirror the design export in /design.
 */

/** Money per good unit. The single place this number lives. */
export const RUPEES_PER_UNIT = 12;

/** Every machine in the plant is rated for this many units per hour. */
export const RATED_PER_HOUR = 2000;

/** Units produced per running minute at rated speed. */
export const RATE_PER_MIN = RATED_PER_HOUR / 60;

/** Minutes in one shift. */
export const SHIFT_MINUTES = 480;

export type ShiftCode = 'A' | 'B' | 'C';

export const SHIFTS: Record<
  ShiftCode,
  { name: string; label: string; start: number; range: string }
> = {
  A: { name: 'Shift A', label: 'Morning', start: 6, range: '06:00–14:00' },
  B: { name: 'Shift B', label: 'Afternoon', start: 14, range: '14:00–22:00' },
  C: { name: 'Shift C', label: 'Night', start: 22, range: '22:00–06:00' },
};

export const SHIFT_ORDER: ShiftCode[] = ['A', 'B', 'C'];

export type CauseKey = 'stop' | 'slow' | 'co' | 'rej';

export const CAUSES: { key: CauseKey; label: string }[] = [
  { key: 'stop', label: 'Stopped' },
  { key: 'slow', label: 'Running slow' },
  { key: 'co', label: 'Changeover' },
  { key: 'rej', label: 'Rejects' },
];

/** Every downtime cause the plant records, in Pareto display order. */
export const DOWNTIME_CAUSES = [
  'Short stops',
  'Waiting for material',
  'Tool change',
  'Setup/changeover',
  'Breakdown',
  'No operator',
  'Quality hold',
];

export type MachineState = 'run' | 'slow' | 'co' | 'stop' | 'idle';

export const STATE_STYLE: Record<
  MachineState,
  { word: string; c: string; tint: string }
> = {
  run: { word: 'Running', c: '#48BB78', tint: 'rgba(72, 187, 120, 0.14)' },
  slow: { word: 'Slow', c: '#ED8936', tint: 'rgba(237, 137, 54, 0.16)' },
  co: { word: 'Changeover', c: '#ED8936', tint: 'rgba(237, 137, 54, 0.16)' },
  stop: { word: 'Stopped', c: '#E53E3E', tint: 'rgba(229, 62, 62, 0.12)' },
  idle: { word: 'Idle', c: '#CBD5E0', tint: 'rgba(203, 213, 224, 0.4)' },
};

export const PLANT_NAME = 'Peenya Unit 2';

/** Speed factor a machine runs at while "running slow". */
export const SLOW_FACTOR = 0.88;

/** How many days of history the seed writes (day -HISTORY_DAYS .. day 0). */
export const HISTORY_DAYS = 14;
