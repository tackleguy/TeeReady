-- TeeReady profiles (cloud golfer settings). Mirrors remote migration 20260821070936 + later goal/questionnaire columns.

create table if not exists public.teeready_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  handicap double precision not null default 18,
  miss text not null default 'right',
  seven_iron_yards integer not null default 150,
  driver_yards integer not null default 225,
  common_courses text[] not null default '{}',
  theme text not null default 'auto',
  goals jsonb not null default '[]'::jsonb,
  target_handicap numeric,
  custom_goals jsonb not null default '[]'::jsonb,
  questionnaire jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teeready_profiles enable row level security;

create policy teeready_profiles_select_own
  on public.teeready_profiles for select
  using (auth.uid() = id);

create policy teeready_profiles_insert_own
  on public.teeready_profiles for insert
  with check (auth.uid() = id);

create policy teeready_profiles_update_own
  on public.teeready_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
