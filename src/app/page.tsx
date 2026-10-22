import Link from 'next/link';

/**
 * The landing page, ported from /design.
 * "Login" and "See the live demo" both go straight into the app. No auth.
 */

const INK = '#14171A';
const MUTED = '#6B7280';
const LINE = '#E2E0DA';
const GREEN = '#1F8A5B';
const AMBER = '#E8890C';
const PAPER = '#F5F4F0';

const sectionPad = 'clamp(56px, 8vw, 96px) clamp(16px, 4vw, 32px)';

const eyebrow: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 500,
  color: MUTED,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const h2: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(28px, 3.4vw, 40px)',
  lineHeight: 1.15,
  fontWeight: 600,
  letterSpacing: '-0.02em',
};

const card: React.CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${LINE}`,
  borderRadius: 8,
};

const STEPS = [
  {
    n: '01',
    title: 'A sensor clips onto each machine',
    text: 'A small sensor clips onto each machine. No PLC rewiring.',
    icon: (
      <>
        <rect x="12" y="14" width="16" height="18" rx="3" />
        <path d="M15 14V8h10v6" />
        <circle cx="20" cy="23" r="3" />
        <path d="M6 20v6M34 20v6" />
      </>
    ),
  },
  {
    n: '02',
    title: 'Every machine streams live',
    text: 'Cycles, stops and speed reach your screen as they happen, on every shift.',
    icon: <path d="M4 22h7l3-9 6 18 4-12 2 3h10" />,
  },
  {
    n: '03',
    title: 'Every lost unit gets a cause',
    text: 'KeenFlo breaks every lost unit into a named cause: stopped, running slow, changeover or rejects.',
    icon: (
      <>
        <path d="M6 10h28M6 17h20M6 24h13M6 31h7" />
        <path d="M28 24l6 0M24 31h10" />
      </>
    ),
  },
];

const TILES = [
  {
    id: 'M-07',
    type: 'CNC Lathe',
    op: 'Ravi Kumar',
    state: 'Stopped',
    dot: AMBER,
    out: '1,612',
    target: '2,000',
    pct: 80.6,
    bar: AMBER,
    note: ['Eff 80.6%', 'Top issue: Short stops'],
    edge: AMBER,
  },
  {
    id: 'M-08',
    type: 'CNC Lathe',
    op: 'Anil Yadav',
    state: 'Running',
    dot: GREEN,
    out: '1,934',
    target: '2,000',
    pct: 96.7,
    bar: GREEN,
    note: ['Eff 95.1%', 'Top issue: Short stops'],
    edge: null,
  },
  {
    id: 'M-20',
    type: 'Labeller',
    op: 'Dinesh Kumar',
    state: 'Idle',
    dot: '#B8B5AE',
    out: '0',
    target: '—',
    pct: 0,
    bar: null,
    note: ['Not scheduled', 'No order this shift'],
    edge: null,
  },
];

const LOSSES = [
  { label: 'Stopped', units: '15,080', rs: '₹1,80,960', left: 95.04, width: 4.96 },
  { label: 'Running slow', units: '5,396', rs: '₹64,752', left: 93.27, width: 1.77 },
  { label: 'Changeover', units: '8,867', rs: '₹1,06,404', left: 90.35, width: 2.92 },
  { label: 'Rejects', units: '3,229', rs: '₹38,748', left: 89.29, width: 1.06 },
];

const FINDINGS = [
  {
    when: 'Night shift · 02:10',
    text: 'M-07 lost 1,240 units on night shift to short stops. ₹14,880.',
  },
  {
    when: 'Night shift · 01:30',
    text: 'Line C mould changes averaged 45 min against a 30 min standard. 3,867 units, ₹46,404.',
  },
  {
    when: 'Night shift · 01:15',
    text: 'M-12 is rejecting 4.6% of parts, about 4.6 times the rest of the plant. 253 units, ₹3,036.',
  },
];

export default function Landing() {
  return (
    <div style={{ background: PAPER, color: INK, minHeight: '100vh' }}>
      <header style={{ borderBottom: `1px solid ${LINE}`, background: PAPER }}>
        <nav
          aria-label="Main"
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '16px clamp(16px, 4vw, 32px)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <a
            href="#top"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              color: INK,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <rect x="1" y="5" width="20" height="12" rx="3" fill="none" stroke={INK} strokeWidth="1.5" />
              <rect x="4" y="8" width="11" height="6" rx="1" fill={INK} />
            </svg>
            <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>KeenFlo</span>
          </a>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '4px 28px',
            }}
          >
            {[
              ['How it works', '#how'],
              ['Features', '#features'],
              ['Pilot', '#pilot'],
            ].map(([label, href]) => (
              <a
                key={href}
                className="kf-link"
                href={href}
                style={{ fontSize: 15, color: INK, textDecoration: 'none', padding: '10px 0' }}
              >
                {label}
              </a>
            ))}
            <Link
              className="kf-btn"
              href="/app/overview"
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: '#FFFFFF',
                background: GREEN,
                textDecoration: 'none',
                padding: '11px 20px',
                borderRadius: 8,
              }}
            >
              Login
            </Link>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* hero */}
        <section
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding:
              'clamp(56px, 9vw, 112px) clamp(16px, 4vw, 32px) clamp(64px, 8vw, 104px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 48,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000 }}>
            <p style={eyebrow}>Production monitoring for Indian manufacturers</p>
            <h1
              style={{
                margin: 0,
                fontSize: 'clamp(34px, 5.2vw, 62px)',
                lineHeight: 1.08,
                fontWeight: 600,
                letterSpacing: '-0.025em',
                textWrap: 'balance',
              }}
            >
              Your machines are rated for 2,000 an hour. You&rsquo;re getting 1,800. KeenFlo shows
              you where the other 200 went.
            </h1>
          </div>

          <figure
            style={{
              ...card,
              margin: 0,
              padding: 'clamp(20px, 3vw, 32px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              maxWidth: 1000,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 13,
                color: MUTED,
              }}
            >
              <span>One machine · units per hour</span>
              <span>
                Rated capacity <strong style={{ color: INK, fontWeight: 600 }}>2,000</strong>
              </span>
            </div>
            <div
              role="img"
              aria-label="Rated capacity 2,000 units an hour. Actual output 1,800. 200 lost, cause unknown."
              style={{
                border: `1.5px solid ${INK}`,
                borderRadius: 8,
                padding: 5,
                height: 64,
                boxSizing: 'border-box',
                display: 'flex',
                gap: 3,
              }}
            >
              <div style={{ flex: '90 1 0', background: INK, borderRadius: 4 }} />
              <div style={{ flex: '10 1 0', background: AMBER, borderRadius: 4 }} />
            </div>
            <figcaption
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: '8px 24px',
                fontSize: 14,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  aria-hidden="true"
                  style={{ width: 10, height: 10, borderRadius: 2, background: INK }}
                />
                <strong style={{ fontWeight: 600 }}>1,800</strong> actual output
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  aria-hidden="true"
                  style={{ width: 10, height: 10, borderRadius: 2, background: AMBER }}
                />
                <strong style={{ fontWeight: 600 }}>200</strong> lost — cause unknown
              </span>
            </figcaption>
          </figure>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '16px 28px',
            }}
          >
            <Link
              className="kf-btn"
              href="/app/overview"
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#FFFFFF',
                background: GREEN,
                textDecoration: 'none',
                padding: '15px 26px',
                borderRadius: 8,
              }}
            >
              See the live demo
            </Link>
            <a
              className="kf-link"
              href="#how"
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: INK,
                textDecoration: 'underline',
                textUnderlineOffset: 4,
                textDecorationColor: '#B8B5AE',
                padding: '12px 0',
              }}
            >
              How it works
            </a>
          </div>
        </section>

        {/* the problem */}
        <section aria-labelledby="problem-h" style={{ borderTop: `1px solid ${LINE}` }}>
          <div
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              padding: sectionPad,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '24px 48px',
            }}
          >
            <h2 id="problem-h" style={{ ...eyebrow, flex: '1 1 200px', paddingTop: 10 }}>
              The problem
            </h2>
            <div
              style={{
                flex: '999 1 560px',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                fontSize: 'clamp(24px, 3vw, 34px)',
                lineHeight: 1.25,
                letterSpacing: '-0.015em',
                fontWeight: 500,
              }}
            >
              <p style={{ margin: 0 }}>The shift register says the line ran fine.</p>
              <p style={{ margin: 0 }}>The numbers say it didn&rsquo;t.</p>
              <p style={{ margin: 0 }}>Nobody can tell which machine, which shift, or why.</p>
            </div>
          </div>
        </section>

        {/* how it works */}
        <section id="how" aria-labelledby="how-h" style={{ borderTop: `1px solid ${LINE}` }}>
          <div
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              padding: sectionPad,
              display: 'flex',
              flexDirection: 'column',
              gap: 48,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={eyebrow}>How it works</p>
              <h2 id="how-h" style={h2}>
                Three steps from the shop floor to a named cause.
              </h2>
            </div>
            <ol
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
                gap: 24,
              }}
            >
              {STEPS.map((s) => (
                <li
                  key={s.n}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    paddingTop: 24,
                    borderTop: `1px solid ${INK}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{s.n}</span>
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 40 40"
                      fill="none"
                      stroke={INK}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {s.icon}
                    </svg>
                  </div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 20,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {s.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: INK }}>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* features */}
        <section id="features" aria-labelledby="features-h" style={{ borderTop: `1px solid ${LINE}` }}>
          <div
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              padding: sectionPad,
              display: 'flex',
              flexDirection: 'column',
              gap: 64,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={eyebrow}>Features</p>
              <h2 id="features-h" style={h2}>
                What you see on the screen.
              </h2>
            </div>

            {/* machine tiles */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '32px 56px',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  flex: '1 1 300px',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.015em' }}>
                  Machine tiles
                </h3>
                <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>
                  Every machine at a glance, with its status, its operator and its output against
                  target. Machines that need attention are marked.
                </p>
              </div>
              <div
                aria-label="Preview of machine tiles"
                style={{
                  ...card,
                  flex: '999 1 560px',
                  minWidth: 0,
                  padding: 20,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))',
                  gap: 12,
                }}
              >
                {TILES.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      border: `1px solid ${LINE}`,
                      borderLeft: t.edge ? `3px solid ${t.edge}` : `1px solid ${LINE}`,
                      borderRadius: 8,
                      padding: t.edge ? '14px 14px 14px 12px' : 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      background: '#FFFFFF',
                    }}
                  >
                    <div style={{ fontSize: 14 }}>
                      <strong style={{ fontWeight: 600 }}>{t.id}</strong>{' '}
                      <span style={{ color: MUTED }}>· {t.type}</span>
                    </div>
                    <div style={{ fontSize: 13 }}>{t.op}</div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{ width: 8, height: 8, borderRadius: '50%', background: t.dot }}
                      />
                      {t.state}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>
                      {t.out}{' '}
                      <span style={{ fontSize: 14, fontWeight: 400, color: MUTED }}>
                        / {t.target}
                      </span>
                    </div>
                    <div style={{ height: 4, background: LINE, borderRadius: 2 }}>
                      {t.bar ? (
                        <div
                          style={{
                            width: `${t.pct}%`,
                            height: 4,
                            background: t.bar,
                            borderRadius: 2,
                          }}
                        />
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.45 }}>
                      {t.note[0]}
                      <br />
                      {t.note[1]}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* where did the output go */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px 56px', alignItems: 'center' }}>
              <div
                style={{
                  flex: '1 1 300px',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.015em' }}>
                  Where did the output go
                </h3>
                <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>
                  Lost output split by cause — stopped, running slow, changeover and rejects — in
                  units and in rupees. Click a cause to see the machines behind it.
                </p>
              </div>
              <div
                aria-label="Preview of the lost-output breakdown for one night shift"
                style={{
                  ...card,
                  flex: '999 1 560px',
                  minWidth: 0,
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontSize: 13,
                    color: MUTED,
                  }}
                >
                  <span>Night shift · 19 machines</span>
                  <span>units · ₹</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 14,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Target</span>
                    <span>3,04,000</span>
                  </div>
                  <div
                    style={{
                      height: 14,
                      border: `1.5px solid ${INK}`,
                      borderRadius: 4,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                {LOSSES.map((l) => (
                  <div key={l.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontSize: 14,
                      }}
                    >
                      <span>{l.label}</span>
                      <span>
                        {l.units} · <span style={{ color: MUTED }}>{l.rs}</span>
                      </span>
                    </div>
                    <div style={{ position: 'relative', height: 14 }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: `${l.left}%`,
                          width: `${l.width}%`,
                          top: 0,
                          bottom: 0,
                          background: AMBER,
                          borderRadius: 2,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 14,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Actual</span>
                    <span>
                      <strong style={{ fontWeight: 600 }}>2,71,429</strong> · 89.3%
                    </span>
                  </div>
                  <div style={{ height: 14 }}>
                    <div style={{ width: '89.29%', height: 14, background: INK, borderRadius: 2 }} />
                  </div>
                </div>
              </div>
            </div>

            {/* findings */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px 56px', alignItems: 'center' }}>
              <div
                style={{
                  flex: '1 1 300px',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.015em' }}>
                  Plain-English findings
                </h3>
                <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>
                  No charts to decode. KeenFlo writes down what happened, on which machine and
                  shift, and what it cost.
                </p>
              </div>
              <div
                aria-label="Preview of findings"
                style={{
                  flex: '999 1 560px',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {FINDINGS.map((f) => (
                  <div
                    key={f.when}
                    style={{
                      ...card,
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 12, color: MUTED }}>{f.when}</div>
                    <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{f.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* who it's for */}
        <section aria-label="Who it's for" style={{ borderTop: `1px solid ${LINE}` }}>
          <div
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              padding: sectionPad,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '24px 48px',
            }}
          >
            <h2 style={{ ...eyebrow, flex: '1 1 200px', paddingTop: 10 }}>Who it&rsquo;s for</h2>
            <p
              style={{
                margin: 0,
                flex: '999 1 560px',
                minWidth: 0,
                fontSize: 'clamp(24px, 3vw, 34px)',
                lineHeight: 1.25,
                letterSpacing: '-0.015em',
                fontWeight: 500,
                textWrap: 'pretty',
              }}
            >
              Built for growing factories with 10 to 50 machines, where you can&rsquo;t watch every
              machine yourself anymore.
            </p>
          </div>
        </section>

        {/* pilot */}
        <section id="pilot" aria-labelledby="pilot-h" style={{ borderTop: `1px solid ${LINE}` }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: sectionPad }}>
            <div
              style={{
                ...card,
                padding: 'clamp(28px, 5vw, 56px)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 32,
              }}
            >
              <div
                style={{
                  flex: '999 1 520px',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <p style={eyebrow}>Pilot</p>
                <h2 id="pilot-h" style={{ ...h2, textWrap: 'balance' }}>
                  Start with a 2-week pilot on 3 machines.
                </h2>
                <p style={{ margin: 0, fontSize: 18, lineHeight: 1.5 }}>
                  If we don&rsquo;t show you where your output goes, you don&rsquo;t pay.
                </p>
              </div>
              <a
                className="kf-btn"
                href="#pilot"
                style={{
                  flex: '0 0 auto',
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: GREEN,
                  textDecoration: 'none',
                  padding: '15px 26px',
                  borderRadius: 8,
                }}
              >
                Book a plant walkthrough
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: `1px solid ${LINE}` }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '28px clamp(16px, 4vw, 32px)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 12px',
            fontSize: 14,
            color: INK,
          }}
        >
          <span style={{ fontWeight: 600 }}>KeenFlo</span>
          <span aria-hidden="true" style={{ color: MUTED }}>
            ·
          </span>
          <span>Bengaluru</span>
          <span aria-hidden="true" style={{ color: MUTED }}>
            ·
          </span>
          <a href="mailto:hello@keenflo.example" style={{ color: INK }}>
            hello@keenflo.example
          </a>
        </div>
      </footer>
    </div>
  );
}
