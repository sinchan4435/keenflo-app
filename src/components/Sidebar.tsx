'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

import { PLANT_NAME, SHIFTS } from '@/lib/config';
import { clock } from '@/lib/format';
import { SPEEDS, Speed } from '@/lib/simulator';
import { useKeenFlo } from '@/lib/use-keenflo';
import { C, CARD_SHADOW } from './ui';

type NavKey = 'overview' | 'machines' | 'operators' | 'downtime' | 'actions' | 'reports';

const NAV: { key: NavKey; label: string; icon: React.ReactNode }[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  },
  {
    key: 'machines',
    label: 'Machines',
    icon: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M7 7V4h10v3M7 13h5M7 16h3" />
      </>
    ),
  },
  {
    key: 'operators',
    label: 'Operators',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.2 2.5 3.5 5.4" />
      </>
    ),
  },
  {
    key: 'downtime',
    label: 'Downtime',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    key: 'actions',
    label: 'Action items',
    icon: (
      <path d="M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17" />
    ),
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 13h6M9 17h6" />
      </>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { t, speed, setSpeed, resetShift, shiftEnded, openActions, loading } = useKeenFlo();
  const openCount = loading ? 0 : openActions().length;

  return (
    <aside
      aria-label="KeenFlo navigation"
      className="kf-no-print"
      style={{
        flex: '0 0 260px',
        width: 260,
        boxSizing: 'border-box',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        background: C.white,
        boxShadow: CARD_SHADOW,
        padding: '28px 16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          color: C.ink,
          padding: '0 12px',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 22 22" aria-hidden="true">
          <rect x="1" y="5" width="20" height="12" rx="4" fill="none" stroke={C.ink} strokeWidth="1.6" />
          <rect x="4" y="8" width="11" height="6" rx="1.5" fill={C.teal} />
        </svg>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.02em' }}>KEENFLO</span>
      </Link>

      <div
        aria-hidden="true"
        style={{
          height: 1,
          background:
            'linear-gradient(90deg, rgba(224, 225, 226, 0) 0%, #E0E1E2 50%, rgba(224, 225, 226, 0) 100%)',
        }}
      />

      <nav aria-label="Pages" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV.map((item) => {
          const href = `/app/${item.key}`;
          const on = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={on ? 'page' : undefined}
              style={{
                font: 'inherit',
                fontSize: 13,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                textDecoration: 'none',
                textAlign: 'left',
                padding: '12px 16px',
                borderRadius: 15,
                background: on ? C.white : 'transparent',
                boxShadow: on
                  ? '0 3.5px 5.5px rgba(0, 0, 0, 0.02), 0 6px 18px rgba(45, 55, 72, 0.06)'
                  : 'none',
                color: on ? C.ink : C.faint,
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto',
                  background: on ? C.teal : C.white,
                  boxShadow: on ? 'none' : '0 3.5px 5.5px rgba(0, 0, 0, 0.04)',
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={on ? C.white : C.faint}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {item.icon}
                </svg>
              </span>
              {item.label}
              {item.key === 'actions' && openCount > 0 ? (
                <span
                  style={{
                    marginLeft: 'auto',
                    minWidth: 22,
                    height: 22,
                    padding: '0 6px',
                    boxSizing: 'border-box',
                    borderRadius: 11,
                    background: C.red,
                    color: C.white,
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {openCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div style={{ flex: '1 1 auto' }} />

      <section
        aria-label="Plant and shift"
        style={{
          background: C.page,
          borderRadius: 15,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              width: 35,
              height: 35,
              borderRadius: 12,
              background: C.teal,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: '0 0 auto',
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.white}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 21V10l5 3V10l5 3V6l8 4v11z" />
            </svg>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <strong style={{ fontSize: 14, fontWeight: 700 }}>{PLANT_NAME}</strong>
            <span style={{ fontSize: 12, color: C.muted }}>
              Shift C · Night · {SHIFTS.C.range}
            </span>
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: C.muted,
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 8, height: 8, borderRadius: '50%', background: C.teal }}
            />
            {shiftEnded ? 'Shift ended' : 'Live'}
          </span>
          <span style={{ fontSize: 22, fontWeight: 700 }} suppressHydrationWarning>
            {clock(t)}
          </span>
        </div>

        <div
          role="group"
          aria-label="Playback speed"
          style={{ display: 'flex', gap: 4, background: C.white, borderRadius: 12, padding: 4 }}
        >
          {SPEEDS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={speed === v}
              onClick={() => setSpeed(v as Speed)}
              style={{
                font: 'inherit',
                flex: '1 1 0',
                border: 0,
                borderRadius: 9,
                padding: '8px 0',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: speed === v ? C.teal : C.white,
                color: speed === v ? C.white : C.ink,
              }}
            >
              {v}x
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={resetShift}
          style={{
            font: 'inherit',
            border: `1px solid ${C.line}`,
            background: C.white,
            color: C.ink,
            borderRadius: 12,
            padding: '10px 0',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reset shift
        </button>
      </section>
    </aside>
  );
}
