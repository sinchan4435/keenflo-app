'use client';

import React from 'react';

import { PLANT_NAME } from '@/lib/config';
import { DateRange, useKeenFlo } from '@/lib/use-keenflo';
import { C, CARD_SHADOW } from './ui';

const RANGES: [DateRange, string][] = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'Last 7 days'],
];

export default function TopBar({
  title,
  showRange = true,
  note = '',
}: {
  title: string;
  showRange?: boolean;
  note?: string;
}) {
  const { range, setRange } = useKeenFlo();

  return (
    <header
      className="kf-no-print"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: C.faint }}>
          Pages <span style={{ color: C.ink }}>/ {title}</span>
        </span>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{title}</h1>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        {showRange ? (
          <div
            role="group"
            aria-label="Date range"
            style={{ display: 'flex', gap: 4, background: C.hair, borderRadius: 12, padding: 4 }}
          >
            {RANGES.map(([k, label]) => {
              const on = range === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setRange(k)}
                  style={{
                    font: 'inherit',
                    border: 0,
                    borderRadius: 9,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: on ? C.white : 'transparent',
                    color: on ? C.ink : C.muted,
                    boxShadow: on ? '0 2px 6px rgba(45, 55, 72, 0.08)' : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: C.muted }}>{note}</span>
        )}

        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: C.white,
            borderRadius: 12,
            padding: '9px 14px',
            boxShadow: CARD_SHADOW,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.teal}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 21V10l5 3V10l5 3V6l8 4v11z" />
          </svg>
          {PLANT_NAME}
        </span>
      </div>
    </header>
  );
}
