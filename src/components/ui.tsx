'use client';

import React from 'react';

/** Palette lifted from the /design export. */
export const C = {
  ink: '#2D3748',
  muted: '#718096',
  faint: '#A0AEC0',
  line: '#E2E8F0',
  hair: '#EDF2F7',
  page: '#F8F9FA',
  white: '#FFFFFF',
  teal: '#4FD1C5',
  tealDark: '#319795',
  green: '#48BB78',
  amber: '#ED8936',
  red: '#E53E3E',
  grey: '#CBD5E0',
  slate: '#4A5568',
};

export const CARD_SHADOW = '0 3.5px 5.5px rgba(0, 0, 0, 0.02)';

export const card: React.CSSProperties = {
  background: C.white,
  borderRadius: 15,
  boxShadow: CARD_SHADOW,
  padding: 22,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

export const h2: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
};

export const sub: React.CSSProperties = {
  fontSize: 13,
  color: C.muted,
};

export const eyebrow: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 700,
  color: C.faint,
};

/** A pill button, used for every filter row in the design. */
export function Pill({
  label,
  on,
  onClick,
  onColor = C.teal,
  shadow = '0 2px 5px rgba(0, 0, 0, 0.06)',
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  onColor?: string;
  shadow?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        font: 'inherit',
        border: 0,
        borderRadius: 10,
        padding: '9px 12px',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        background: on ? onColor : C.white,
        color: on ? C.white : C.ink,
        boxShadow: shadow,
      }}
    >
      {label}
    </button>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  minWidth = 170,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
  minWidth?: number;
}) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontSize: 12,
        fontWeight: 700,
        color: C.faint,
      }}
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          font: 'inherit',
          fontSize: 13,
          fontWeight: 500,
          color: C.ink,
          background: C.white,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          padding: '9px 12px',
          minWidth,
        }}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Shown instead of a screen when something went wrong. Never a blank page. */
export function ErrorCard({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        background: C.white,
        borderRadius: 15,
        boxShadow: CARD_SHADOW,
        borderLeft: `4px solid ${C.red}`,
        padding: '22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 720,
      }}
    >
      <strong style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{title}</strong>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: C.muted }}>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            font: 'inherit',
            alignSelf: 'flex-start',
            border: 0,
            borderRadius: 12,
            padding: '10px 18px',
            background: C.teal,
            color: C.white,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** A quiet placeholder while the first Supabase read is in flight. */
export function Loading({ what = 'the plant' }: { what?: string }) {
  return (
    <div
      style={{
        background: C.white,
        borderRadius: 15,
        boxShadow: CARD_SHADOW,
        padding: '40px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: C.muted,
        fontSize: 14,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: C.teal,
        }}
      />
      Loading {what}…
    </div>
  );
}

/** One horizontal bar with a label and a value, as used all over the design. */
export function BarRow({
  label,
  right,
  widthPct,
  color = C.teal,
  onClick,
}: {
  label: React.ReactNode;
  right: React.ReactNode;
  widthPct: number;
  color?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          width: '100%',
          fontSize: 14,
        }}
      >
        {label}
        {right}
      </span>
      <span
        style={{
          display: 'block',
          width: '100%',
          height: 8,
          background: C.hair,
          borderRadius: 4,
        }}
      >
        <span
          style={{
            display: 'block',
            height: 8,
            borderRadius: 4,
            width: `${Math.max(0, Math.min(100, widthPct))}%`,
            background: color,
          }}
        />
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0' }}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="kf-card-btn"
      style={{
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        background: C.white,
        border: 0,
        borderRadius: 12,
        padding: '10px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
        color: C.ink,
      }}
    >
      {inner}
    </button>
  );
}
