-- ============================================================
-- KeenFlo - production monitoring schema
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Safe to re-run: it drops and recreates everything.
-- ============================================================

-- ---------- clean slate ----------
drop table if exists public.action_items     cascade;
drop table if exists public.downtime_events  cascade;
drop table if exists public.hourly_output    cascade;
drop table if exists public.shift_assignments cascade;
drop table if exists public.operators cascade;
drop table if exists public.machines  cascade;
drop table if exists public.lines     cascade;

drop type if exists public.shift_code    cascade;
drop type if exists public.dt_status     cascade;
drop type if exists public.action_status cascade;

-- ---------- enums ----------
create type public.shift_code    as enum ('A', 'B', 'C');
create type public.dt_status     as enum ('open', 'acknowledged', 'resolved');
create type public.action_status as enum ('todo', 'in_progress', 'done');

-- ---------- master data ----------
create table public.lines (
  id           text primary key,              -- 'A' | 'B' | 'C' | 'D'
  name         text not null,                 -- 'Line A'
  process_type text not null                  -- 'CNC machining'
);

create table public.machines (
  id             text primary key,            -- 'M-07'
  line_id        text not null references public.lines (id) on delete cascade,
  type           text not null,               -- 'CNC Lathe'
  rated_per_hour integer not null default 2000
);

create table public.operators (
  id              text primary key,           -- 'OP-M-07-C'
  name            text not null,
  role            text not null,              -- 'Machine operator'
  avatar_initials text not null               -- 'RK'
);

create table public.shift_assignments (
  machine_id  text not null references public.machines (id)  on delete cascade,
  operator_id text not null references public.operators (id) on delete cascade,
  shift       public.shift_code not null,
  primary key (machine_id, shift)
);

-- ---------- history ----------
-- One row per machine, per shift, per hour-of-shift (hour 0..7).
create table public.hourly_output (
  id             bigint generated always as identity primary key,
  machine_id     text not null references public.machines (id) on delete cascade,
  date           date not null,               -- IST calendar date the shift started on
  shift          public.shift_code not null,
  hour           smallint not null check (hour between 0 and 7),
  target         integer not null default 0,
  produced       integer not null default 0,
  rejects        integer not null default 0,
  stopped_min    numeric(6,2) not null default 0,
  slow_min       numeric(6,2) not null default 0,
  changeover_min numeric(6,2) not null default 0,
  idle_min       numeric(6,2) not null default 0,
  unique (machine_id, date, shift, hour)
);

create table public.downtime_events (
  id           uuid primary key default gen_random_uuid(),
  machine_id   text not null references public.machines (id)  on delete cascade,
  operator_id  text          references public.operators (id) on delete set null,
  date         date not null,
  shift        public.shift_code not null,
  start_at     timestamptz not null,
  duration_min numeric(6,2) not null,
  cause        text not null,
  status       public.dt_status not null default 'resolved',
  occurrences  integer not null default 1,     -- short stops are grouped per hour
  created_at   timestamptz not null default now()
);

-- ---------- user actions ----------
create table public.action_items (
  id              text primary key,            -- 'm07'
  machine_id      text references public.machines (id) on delete set null,
  title           text not null,
  severity        text not null,               -- 'Critical' | 'High' | 'Medium'
  rupees_per_week numeric(12,2) not null default 0,
  evidence        text not null default '',
  likely_causes   text[] not null default '{}',
  fix_steps       text[] not null default '{}',
  owner_team      text not null,
  due_date        date,
  status          public.action_status not null default 'todo',
  resolved_at     timestamptz,
  -- extra display fields the design needs
  machines        text[] not null default '{}',
  who             text not null default '',
  suggested_fix   text not null default '',
  opened_on       date,
  started_on      date,
  closed_on       date,
  support_name    text,
  support_where   text,
  support_text    text,
  sort_order      integer not null default 0
);

-- ---------- indexes ----------
create index hourly_output_date_shift_idx   on public.hourly_output (date, shift);
create index hourly_output_machine_date_idx on public.hourly_output (machine_id, date);
create index hourly_output_date_machine_idx on public.hourly_output (date, machine_id);

create index downtime_date_shift_idx   on public.downtime_events (date, shift);
create index downtime_machine_date_idx on public.downtime_events (machine_id, date);
create index downtime_start_idx        on public.downtime_events (start_at desc);
create index downtime_cause_idx        on public.downtime_events (cause);

create index machines_line_idx        on public.machines (line_id);
create index shift_assignments_op_idx on public.shift_assignments (operator_id);
create index action_items_status_idx  on public.action_items (status);

-- ============================================================
-- Row level security
--   anon may READ everything.
--   anon may UPDATE only the status columns on action_items
--   and downtime_events. No anon INSERT or DELETE anywhere.
-- ============================================================
alter table public.lines             enable row level security;
alter table public.machines          enable row level security;
alter table public.operators         enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.hourly_output     enable row level security;
alter table public.downtime_events   enable row level security;
alter table public.action_items      enable row level security;

-- read-only for everyone (anon + authenticated)
create policy "read lines"     on public.lines             for select to anon, authenticated using (true);
create policy "read machines"  on public.machines          for select to anon, authenticated using (true);
create policy "read operators" on public.operators         for select to anon, authenticated using (true);
create policy "read shifts"    on public.shift_assignments for select to anon, authenticated using (true);
create policy "read hourly"    on public.hourly_output     for select to anon, authenticated using (true);
create policy "read downtime"  on public.downtime_events   for select to anon, authenticated using (true);
create policy "read actions"   on public.action_items      for select to anon, authenticated using (true);

-- updates are allowed on the two action tables only
create policy "update downtime status" on public.downtime_events
  for update to anon, authenticated using (true) with check (true);

create policy "update action status" on public.action_items
  for update to anon, authenticated using (true) with check (true);

-- Column-level lockdown: anon may only change the status fields.
-- Revoke everything, then grant back exactly what is needed.
revoke all on public.lines, public.machines, public.operators,
              public.shift_assignments, public.hourly_output,
              public.downtime_events, public.action_items
  from anon, authenticated;

grant select on public.lines, public.machines, public.operators,
                public.shift_assignments, public.hourly_output,
                public.downtime_events, public.action_items
  to anon, authenticated;

grant update (status)              on public.downtime_events to anon, authenticated;
grant update (status, resolved_at) on public.action_items    to anon, authenticated;

-- ---------- realtime ----------
alter table public.action_items    replica identity full;
alter table public.downtime_events replica identity full;

do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'action_items'
  ) then
    alter publication supabase_realtime add table public.action_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'downtime_events'
  ) then
    alter publication supabase_realtime add table public.downtime_events;
  end if;
end
$do$;
