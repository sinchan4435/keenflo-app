'use client';

import React from 'react';

import { PLANT_NAME } from '@/lib/config';
import { C } from './ui';

export type ReportData = {
  title: string;
  sub: string;
  sentence: string;
  k: { good: string; target: string; eff: string; lost: string; rs: string };
  causes: { label: string; units: string; rs: string; share: string; w: number }[];
  shifts: { name: string; target: string; good: string; eff: string; lost: string; rs: string }[];
  showShifts: boolean;
  top5: { n: number; what: string; units: string; rs: string }[];
  actions: { t: string; owner: string; due: string; status: string; wk: string }[];
  generated: string;
};

const sectionTitle: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 700 };
const th: React.CSSProperties = { padding: '6px 0', borderBottom: '1px solid #CBD5E0' };
const td: React.CSSProperties = { padding: '7px 0', borderBottom: `1px solid ${C.hair}` };

/** A single A4 page, ready to print or save as PDF. */
export default function PrintableReport({
  data,
  onBack,
}: {
  data: ReportData;
  onBack: () => void;
}) {
  return (
    <div
      style={{
        background: C.hair,
        minHeight: '100vh',
        padding: '24px 16px 48px',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="kf-no-print"
        style={{
          maxWidth: 794,
          margin: '0 auto 16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            font: 'inherit',
            border: 0,
            borderRadius: 12,
            padding: '10px 16px',
            background: C.white,
            color: C.ink,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 3.5px 5.5px rgba(0, 0, 0, 0.04)',
          }}
        >
          ← Back to reports
        </button>
        <span style={{ fontSize: 12, color: C.muted }}>
          One page, ready to print or save as PDF
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            font: 'inherit',
            border: 0,
            borderRadius: 12,
            padding: '11px 18px',
            background: C.teal,
            color: C.white,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Print / Save as PDF
        </button>
      </div>

      <article
        style={{
          maxWidth: 794,
          margin: '0 auto',
          background: C.white,
          padding: '44px 52px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          color: '#1A202C',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            borderBottom: '2px solid #1A202C',
            paddingBottom: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>
              KEENFLO · {PLANT_NAME.toUpperCase()}
            </span>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{data.title}</h1>
            <span style={{ fontSize: 13, color: C.slate }}>{data.sub}</span>
          </div>
          <svg width="28" height="28" viewBox="0 0 22 22" aria-hidden="true">
            <rect x="1" y="5" width="20" height="12" rx="4" fill="none" stroke="#1A202C" strokeWidth="1.6" />
            <rect x="4" y="8" width="11" height="6" rx="1.5" fill={C.teal} />
          </svg>
        </header>

        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, fontWeight: 600 }}>
          {data.sentence}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          {[
            { label: 'Output', value: data.k.good, note: `of ${data.k.target}` },
            { label: 'Efficiency', value: data.k.eff, note: '' },
            { label: 'Units lost', value: data.k.lost, note: '' },
            { label: '₹ lost', value: data.k.rs, note: '' },
          ].map((k) => (
            <div
              key={k.label}
              style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{k.value}</div>
              {k.note ? <div style={{ fontSize: 11, color: C.muted }}>{k.note}</div> : null}
            </div>
          ))}
        </div>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={sectionTitle}>Where the output went</h2>
          {data.causes.map((rc) => (
            <div
              key={rc.label}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px minmax(0, 1fr) 150px',
                alignItems: 'center',
                gap: 12,
                fontSize: 12,
              }}
            >
              <span>{rc.label}</span>
              <span style={{ height: 8, background: C.hair, borderRadius: 4 }}>
                <span
                  style={{
                    display: 'block',
                    height: 8,
                    width: `${rc.w}%`,
                    background: C.teal,
                    borderRadius: 4,
                  }}
                />
              </span>
              <span style={{ textAlign: 'right' }}>
                {rc.units} · <strong>{rc.rs}</strong> · {rc.share}
              </span>
            </div>
          ))}
        </section>

        {data.showShifts ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={sectionTitle}>By shift</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr
                  style={{
                    textAlign: 'right',
                    fontSize: 10,
                    color: C.muted,
                    letterSpacing: '0.04em',
                  }}
                >
                  <th scope="col" style={{ ...th, textAlign: 'left' }}>
                    SHIFT
                  </th>
                  <th scope="col" style={th}>
                    TARGET
                  </th>
                  <th scope="col" style={th}>
                    PRODUCED
                  </th>
                  <th scope="col" style={th}>
                    EFFICIENCY
                  </th>
                  <th scope="col" style={th}>
                    UNITS LOST
                  </th>
                  <th scope="col" style={th}>
                    ₹ LOST
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.shifts.map((s) => (
                  <tr key={s.name} style={{ textAlign: 'right' }}>
                    <th
                      scope="row"
                      style={{ ...td, textAlign: 'left', fontWeight: 600 }}
                    >
                      {s.name}
                    </th>
                    <td style={td}>{s.target}</td>
                    <td style={td}>{s.good}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{s.eff}</td>
                    <td style={td}>{s.lost}</td>
                    <td style={td}>{s.rs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={sectionTitle}>Top 5 losses</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {data.top5.map((rt) => (
                <tr key={rt.n}>
                  <td style={{ ...td, width: 24, fontWeight: 700 }}>{rt.n}</td>
                  <td style={td}>{rt.what}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{rt.units} units</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, width: 90 }}>
                    {rt.rs}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {data.actions.length > 0 ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={sectionTitle}>Open action items</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {data.actions.map((ra) => (
                  <tr key={ra.t}>
                    <td style={{ ...td, fontWeight: 600 }}>{ra.t}</td>
                    <td style={td}>{ra.owner}</td>
                    <td style={td}>Due {ra.due}</td>
                    <td style={td}>{ra.status}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{ra.wk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <footer
          style={{
            fontSize: 11,
            color: C.muted,
            borderTop: `1px solid ${C.line}`,
            paddingTop: 10,
          }}
        >
          {data.generated}
        </footer>
      </article>
    </div>
  );
}
