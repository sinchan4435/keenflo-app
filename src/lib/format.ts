import { RUPEES_PER_UNIT, SHIFTS, ShiftCode } from './config';

/** 179677 -> "1,79,677". Indian digit grouping. */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

/** Units -> "₹2,34,000". */
export function rs(units: number): string {
  return '₹' + Math.round(units * RUPEES_PER_UNIT).toLocaleString('en-IN');
}

/** Units -> "₹2.34 lakh" once the amount passes one lakh. */
export function rsShort(units: number): string {
  const v = units * RUPEES_PER_UNIT;
  return v >= 100_000
    ? '₹' + (v / 100_000).toFixed(2) + ' lakh'
    : '₹' + Math.round(v).toLocaleString('en-IN');
}

/** Rupees -> "₹2.34 lakh". For values already in rupees. */
export function rupeesShort(v: number): string {
  return v >= 100_000
    ? '₹' + (v / 100_000).toFixed(2) + ' lakh'
    : '₹' + Math.round(v).toLocaleString('en-IN');
}

export function pct(a: number, b: number): string {
  return b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—';
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Shift minute -> wall clock, e.g. minute 90 of shift C -> "23:30". */
export function hm(minute: number, shift: ShiftCode = 'C'): string {
  const total = (SHIFTS[shift].start * 60 + Math.floor(minute)) % 1440;
  return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
}

/** Seconds into shift C -> "03:45:12". */
export function clock(seconds: number, shift: ShiftCode = 'C'): string {
  const total = (SHIFTS[shift].start * 3600 + Math.floor(seconds)) % 86400;
  return (
    pad(Math.floor(total / 3600)) +
    ':' +
    pad(Math.floor((total % 3600) / 60)) +
    ':' +
    pad(total % 60)
  );
}

/** Minutes -> "1 h 20 min" or "20 min". */
export function dur(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? h + ' h ' + m + ' min' : m + ' min';
}

/** A signed change, coloured green when it is the good direction. */
export type Delta = { text: string; vs: string; color: string };

export function delta(
  cur: number,
  prev: number,
  upIsGood: boolean,
  kind: 'pct' | 'pts',
  vs: string
): Delta {
  if (!(prev > 0) && kind !== 'pts') return { text: '—', vs, color: '#A0AEC0' };
  const v = kind === 'pts' ? cur - prev : ((cur - prev) / prev) * 100;
  if (!isFinite(v)) return { text: '—', vs, color: '#A0AEC0' };
  const good = upIsGood ? v >= 0 : v <= 0;
  return {
    text: (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%',
    vs,
    color: good ? '#48BB78' : '#E53E3E',
  };
}
