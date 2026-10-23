# KeenFlo

**KeenFlo shows growing manufacturers exactly where their lost output goes: which machine, which shift, which cause.**

Live demo: _(paste your Vercel URL here)_

A production monitoring web app for a 20-machine Indian factory. Every number on every
screen is computed from real rows — 15 days of shift history in Supabase, plus a night
shift simulated live in the browser. Nothing is hard-coded.

---

## Screens

| Page | What it does |
| --- | --- |
| `/` | Landing page. "Login" and "See the live demo" both go straight into the app. No auth. |
| `/app/overview` | The live night shift in one sentence, plant KPIs against the chosen date range, the three issues costing the most right now, output per hour against target and last night, lost output split by cause, and yesterday shift by shift. |
| `/app/machines` | All 20 machines grouped by line, with live status, operator, output this hour, efficiency and top issue. Filter by line, status, search; sort four ways. Click any machine for the drawer. |
| Machine drawer | Shift timeline of every state change, output per hour, where that machine's output went, tonight vs last night side by side, its last five downtime events, and its open action item. |
| `/app/operators` | Top performers this week, who needs support, and a table of every operator with a 7-day efficiency sparkline against their own average. Filter by shift. |
| `/app/downtime` | Pareto of downtime by cause, a machine × hour heatmap of minutes stopped, and the full event log. Live events from tonight are merged with database history and tagged `live`. Open events can be acknowledged. |
| `/app/actions` | Action items in To do / In progress / Done, each with measured evidence, likely causes, numbered fix steps and what it costs per week. "Mark in progress" and "Mark resolved" write to Supabase. Resolving a problem actually stops the live shift losing output to it. |
| **Foreman** (on every `/app` page) | A floating AI assistant in the bottom-right corner. Ask it anything about this plant and it answers from the live shift plus the Supabase history. See below. |
| `/app/reports` | Pick any of the last 8 days: KPIs vs the day before, shift A/B/C comparison, top 5 losses, a 7-day efficiency trend for the plant and each line, and the action items opened or closed that day. Daily and shift reports render as a one-page A4 sheet you can print or save as PDF. |

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** (strict)
- **Tailwind CSS** for the base layer; the screens use the design export's own inline styles so the layout matches it exactly
- **Recharts** for the line, bar and Pareto charts
- **lucide-react**, **@supabase/supabase-js**
- **@google/genai** (Google Gemini) for Foreman, the AI plant assistant
- **Supabase** (Postgres + Row Level Security + Realtime)

## Architecture

Two sources of data, one shape.

**Supabase holds everything that already happened.** Master data (4 lines, 20 machines,
60 operators, shift assignments), 15 days of `hourly_output` — one row per machine, per
shift, per hour of that shift — and every `downtime_event`. It also holds the action
items and their status, because those are real user actions that must survive a refresh
and be visible to everyone.

**The current night shift is simulated in the browser.** A deterministic, seeded
simulator (`src/lib/sim-core.ts`) runs shift C of today minute by minute. It is pure
TypeScript with no browser or Node APIs, so the seed script and the browser run the exact
same code and get identical numbers. That means the demo always has a shift in progress
on Vercel, with no background server, no cron job and nothing to keep warm.

Both sources are rolled up into the same `Stats` shape (`src/lib/analytics.ts`), so a
screen can mix "today so far" (database shifts A and B + the live shift C) without caring
where a number came from. The date switch, the Reports day picker, the operator trends and
the downtime Pareto and heatmap all read real rows.

```
src/lib/
  config.ts      constants: ₹12 per unit, 2,000 units/hour, shift times, colours
  plant.ts       the machine roster, in the order the simulator seeds from
  sim-core.ts    the deterministic engine: seeded RNG, segments, statistics
  simulator.ts   the live shift: clock, 1x/10x/60x, reset, fixes
  analytics.ts   database rows -> the same Stats shape; aggregation; severity
  dates.ts       IST date maths
  format.ts      Indian number formatting (1,79,677 and ₹2.34 lakh)
  use-keenflo.tsx  one provider: load, clock, date range, writes, Realtime
```

### Writes and Realtime

"Mark in progress", "Mark resolved" and downtime "Acknowledge" update Supabase. The app
subscribes to Postgres changes on `action_items` and `downtime_events`, so a change made
in one tab shows up in every other open tab within a second.

### Security

Row Level Security is on for every table. `anon` can `SELECT` everything, and can `UPDATE`
**only** the status columns on `action_items` and `downtime_events` — enforced twice, with
an RLS policy and with column-level `GRANT`s. No `anon` inserts or deletes anywhere.

The service role key is used in exactly one file, `scripts/seed.ts`. It is never imported
into app code and never reaches the browser.

## Foreman, the AI plant assistant

Foreman is a chat popup in the bottom-right corner of every `/app` page. It answers
questions about **this** plant, from **this** plant's data — never from general knowledge.

Ask it things like:

- *What should I fix first?* — it ranks the open problems by ₹ lost per week and gives
  the actual fix steps.
- *What happened on night shift yesterday?* — efficiency, units lost, worst machine.
- *Why is M-07 losing output?* — the cause, the cost, and what to do.
- *Who is the operator on M-07 right now?* — straight from the live shift.
- *What's the weather?* — it says plainly that it only knows plant data.

### How it gets its answers

Foreman is given two things with every question:

1. **The live shift**, built in the browser from the simulator: the sim clock, plant
   totals, every machine's status, operator, efficiency, units lost and top issue, the
   loss split by cause, and the open problems ranked by what they are costing tonight.
   The night shift only exists in the browser, so the client sends it along.
2. **A history summary**, built on the server from Supabase: yesterday shift by shift,
   plant efficiency for each of the last 7 days, the machines that lost the most, the
   top downtime causes, the full operator roster, and every action item with its evidence
   and fix steps.

Both are **summarised, never dumped**. The whole prompt stays small, and the Supabase
summary is cached for five minutes so repeat questions are fast.

### Setup

Add your Google Gemini API key to `.env.local`:

```
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=
```

Get a key at [aistudio.google.com](https://aistudio.google.com/apikey). Leave
`GEMINI_MODEL` blank to use the default, or set it to any model your key can reach.

**About the default model.** It is `gemini-3.6-flash`, confirmed present with
`ai.models.list()` and confirmed working with a real streaming call on this project's
key. Several newer Flash models are also available, but when tested they answered the
same prompt in 10–200 seconds against roughly 3 seconds for this one, and a chat popup
that takes three minutes to reply is no use on a shop floor. Set `GEMINI_MODEL` to change
it without touching code.

If `GEMINI_API_KEY` is missing, Foreman replies "Foreman is offline: API key not
configured" instead of crashing the app. Rate limits and Gemini outages show as a small
message inside the chat.

### Security

`GEMINI_API_KEY` is read in exactly one file — `src/app/api/chat/route.ts`, which runs on
the Node runtime on the server. It is never imported into client code and never appears
in the browser bundle. The route also:

- rejects more than 20 messages or any message over 1,000 characters with a `400`
- rate-limits each IP to 20 requests per 5 minutes, with a friendly `429`
- reads Supabase with the public anon key only, which RLS restricts to `SELECT`

## The planted problems

The seeded data contains five real, findable problems. They show up on every screen that
should surface them, because every screen reads the same rows.

| Machine | Problem | Where you see it |
| --- | --- | --- |
| **M-07** (Line B) | Frequent short stops, far worse on the night shift between 02:00 and 04:00 | Top of "Fix these first"; red block in the Downtime heatmap; the drawer's shift timeline; the M-07 action item's evidence chart |
| **M-12** (Line A) | Runs about 12% below rated speed, on every shift | "Running slow" on the Machines tile; the M-12 evidence chart sits flat at 88% against the rated-speed line |
| **Line C** (M-10, M-11, M-13, M-14, M-15) | Mould changes average about 61 minutes against a 30 minute standard — roughly twice as long as changeovers elsewhere | Usually the single biggest loss on the Overview; every bar on the Line C evidence chart is above the 30 min line |
| **M-18** (Line B) | Rejects climb from about 0.5% to about 6% after four hours of running | The M-18 evidence chart ramps up from hour 5 onward |
| **M-03** (Line A) | Coolant pump trips — **already fixed** four days ago | The one item in the Done column; its evidence chart shows breakdowns stopping dead after the fix |

Plant efficiency over the last 7 days lands around **90.7%**, and **yesterday's night
shift is visibly the worst shift of the fortnight at about 84.1%**.

## Local setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).

2. **Run the schema.** Open the SQL Editor, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql) and run it. It is safe to run again — it
   drops and recreates everything.

3. **Add your keys.** Copy `.env.example` to `.env.local` and fill in all three:

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   GEMINI_API_KEY=
   GEMINI_MODEL=
   ```

   Supabase Project Settings → API has the first three.
   `GEMINI_API_KEY` comes from [aistudio.google.com](https://aistudio.google.com/apikey)
   and powers Foreman; leave `GEMINI_MODEL` blank for the default.
   `.env.local` is git-ignored.

4. **Install and seed.**

   ```bash
   npm install
   npm run seed
   ```

   The seed is deterministic and idempotent: it clears every table, then writes 4 lines,
   20 machines, 60 operators, 60 shift assignments, ~7,000 `hourly_output` rows, ~7,100
   `downtime_events` and 5 action items. It prints the row counts and the planted problems
   when it finishes.

5. **Run it.**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Deploying to Vercel

Import the repo, then add the same variables under Settings → Environment Variables.

- The two `NEXT_PUBLIC_` ones are read in the browser, so they must be present at
  **build** time.
- `GEMINI_API_KEY` is read on the server at request time. Without it the app still works;
  Foreman just reports that it is offline.
- `SUPABASE_SERVICE_ROLE_KEY` is only needed if you want to run the seed from that
  environment.

## Notes

- Dates are anchored to the newest date in `hourly_output`, so the demo still reads
  correctly however long after seeding you open it. Re-run `npm run seed` to move the
  whole window to today.
- The seed writes 15 days rather than 7, because the "Last 7 days" range compares itself
  against the 7 days before it.
- ₹12 per unit and 2,000 units per hour each live in one place, `src/lib/config.ts`.
- If the Supabase environment variables are missing or a query fails, every screen shows
  an inline error card with a Try again button — never a blank page.

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm run lint    # eslint
npm run seed    # clear and re-seed Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
```

The design export this was built from is kept in [`design/`](design/).
