import { SHIFTS, ShiftCode } from './config';

/** The plant runs on Indian Standard Time, which is UTC+05:30 all year. */
export const IST_OFFSET_MINUTES = 330;
export const IST_OFFSET = '+05:30';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Today's calendar date in India, as 'YYYY-MM-DD'. */
export function istToday(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Add days to a 'YYYY-MM-DD' string and return a 'YYYY-MM-DD' string. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days between two 'YYYY-MM-DD' strings: later minus earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + 'T00:00:00Z');
  const b = Date.parse(toIso + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

/**
 * When a shift started, as an ISO timestamp with the IST offset.
 * Shift C starts at 22:00 on its own date and runs into the next morning.
 */
export function shiftStartAt(isoDate: string, shift: ShiftCode, minuteIntoShift = 0): string {
  const total = SHIFTS[shift].start * 60 + Math.round(minuteIntoShift);
  const dayRoll = Math.floor(total / 1440);
  const rem = ((total % 1440) + 1440) % 1440;
  const date = dayRoll === 0 ? isoDate : addDays(isoDate, dayRoll);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date}T${pad(Math.floor(rem / 60))}:${pad(rem % 60)}:00${IST_OFFSET}`;
}

/** 'Wed 21 Oct', or 'Wed 21' when short. */
export function dayLabelFromIso(isoDate: string, short = false): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  const w = WEEKDAYS[d.getUTCDay()];
  return short
    ? `${w} ${d.getUTCDate()}`
    : `${w} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
