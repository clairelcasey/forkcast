-- Forkcast initial schema (Milestone 1: Foundation).
--
-- Every user-data table carries user_id and has row-level security so each
-- user can only reach their own rows. See docs/spec.md "Data model".

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Allowlist + auth hook
-- ---------------------------------------------------------------------------

-- Emails allowed to create an account. Managed by hand in the Supabase
-- dashboard / SQL editor. No user can read or write it: RLS is on with no
-- policies, and only the auth hook role is granted access.
create table public.allowed_users (
  email text primary key check (email = lower(email)),
  note text,
  created_at timestamptz not null default now()
);

alter table public.allowed_users enable row level security;
revoke all on public.allowed_users from anon, authenticated, public;

-- "Before User Created" auth hook: rejects any sign-up whose email is not on
-- the allowlist. Opening the app up later means disabling this hook.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  user_email text := lower(event -> 'user' ->> 'email');
begin
  if user_email is not null and exists (
    select 1 from public.allowed_users where email = user_email
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email is not on the access list.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from anon, authenticated, public;
grant select on public.allowed_users to supabase_auth_admin;

create policy "Auth hook can read allowlist"
  on public.allowed_users
  as permissive
  for select
  to supabase_auth_admin
  using (true);

-- ---------------------------------------------------------------------------
-- profiles: settings and target defaults (one row per user)
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'America/New_York',
  units text not null default 'imperial' check (units in ('imperial', 'metric')),
  -- Target defaults per day type (spec: "Targets and safety guardrails").
  protein_rest_g integer not null default 100 check (protein_rest_g between 0 and 400),
  protein_strength_g integer not null default 110 check (protein_strength_g between 0 and 400),
  protein_run_g integer not null default 110 check (protein_run_g between 0 and 400),
  protein_long_run_g integer not null default 120 check (protein_long_run_g between 0 and 400),
  baseline_calories integer check (baseline_calories between 1000 and 6000),
  rest_day_deficit integer not null default 250 check (rest_day_deficit between 0 and 750),
  calorie_floor integer not null default 1600 check (calorie_floor between 1200 and 4000),
  long_run_distance_m integer not null default 12875 check (long_run_distance_m > 0), -- 8 mi
  max_loss_lb_per_week numeric(3, 2) not null default 0.50 check (max_loss_lb_per_week between 0 and 1),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create a profile automatically when an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- places: restaurants ordered from
-- ---------------------------------------------------------------------------

create table public.places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  google_place_id text,
  name text not null,
  is_chain boolean not null default false,
  menu_snapshot jsonb,
  menu_snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, google_place_id)
);

-- ---------------------------------------------------------------------------
-- foods: nutrition entries already looked up
-- ---------------------------------------------------------------------------

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('usda', 'nutritionix', 'fatsecret')),
  provider_id text not null,
  name text not null,
  brand text,
  serving_size numeric,
  serving_unit text,
  calories numeric not null check (calories >= 0),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_id)
);

-- ---------------------------------------------------------------------------
-- saved_meals: reusable meals (the cache)
-- ---------------------------------------------------------------------------

create table public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  nickname text,
  items jsonb not null default '[]'::jsonb,
  calories numeric not null default 0 check (calories >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  place_id uuid references public.places (id) on delete set null,
  -- Dimension is fixed in Milestone 3 once the embedding model is chosen.
  embedding extensions.vector,
  use_count integer not null default 0,
  last_used_at timestamptz,
  version integer not null default 1,
  -- Older versions point at the meal that replaced them so old logs stay unchanged.
  superseded_by uuid references public.saved_meals (id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index saved_meals_user_nickname_key
  on public.saved_meals (user_id, lower(nickname))
  where nickname is not null and archived = false;
create index saved_meals_user_recent_idx on public.saved_meals (user_id, last_used_at desc);

-- ---------------------------------------------------------------------------
-- meal_logs: each time something was eaten
-- ---------------------------------------------------------------------------

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  logged_at timestamptz not null default now(),
  timezone text not null,
  local_date date not null,
  saved_meal_id uuid references public.saved_meals (id) on delete set null,
  input_text text,
  items jsonb not null default '[]'::jsonb,
  modifiers jsonb,
  portion numeric not null default 1 check (portion > 0 and portion <= 10),
  calories numeric not null check (calories >= 0),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  source text not null check (source in ('cache', 'ai', 'manual')),
  confidence text check (confidence in ('high', 'medium', 'low')),
  -- Client-generated id so the offline queue can retry without duplicates.
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create index meal_logs_user_date_idx on public.meal_logs (user_id, local_date desc);

-- ---------------------------------------------------------------------------
-- strava_connections: Strava access (tokens are server-only)
-- ---------------------------------------------------------------------------

create table public.strava_connections (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  athlete_id bigint not null,
  -- Encrypted by the server before storage; never readable from the client.
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- workouts: activities from Strava plus manual Pilates
-- ---------------------------------------------------------------------------

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  strava_activity_id bigint,
  type text not null check (type in ('run', 'pilates', 'strength', 'other')),
  started_at timestamptz not null,
  local_date date not null,
  distance_m numeric check (distance_m >= 0),
  duration_s integer check (duration_s >= 0),
  calories_estimate numeric check (calories_estimate >= 0),
  source text not null check (source in ('strava', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Dedupe key: the same Strava activity synced twice is stored once.
  unique (user_id, strava_activity_id)
);

create index workouts_user_date_idx on public.workouts (user_id, local_date desc);

-- ---------------------------------------------------------------------------
-- day_targets: each day's computed targets
-- ---------------------------------------------------------------------------

create table public.day_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  day_type text not null check (day_type in ('rest', 'strength', 'run', 'long_run')),
  protein_g integer not null check (protein_g >= 0),
  calories integer not null check (calories >= 0),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- weigh_ins
-- ---------------------------------------------------------------------------

create table public.weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 20 and 400),
  source text not null default 'manual' check (source in ('manual', 'shortcut')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index weigh_ins_user_time_idx on public.weigh_ins (user_id, measured_at desc);

-- ---------------------------------------------------------------------------
-- ai_calls: every Claude call (written by the server)
-- ---------------------------------------------------------------------------

create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purpose text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  cost_usd numeric(10, 6),
  latency_ms integer,
  cache_hit boolean,
  error text,
  created_at timestamptz not null default now()
);

create index ai_calls_user_time_idx on public.ai_calls (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- eval_cases: hand-checked meals for testing
-- ---------------------------------------------------------------------------

create table public.eval_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  input_text text not null,
  expected_items jsonb not null default '[]'::jsonb,
  expected_calories numeric not null check (expected_calories >= 0),
  expected_protein_g numeric not null check (expected_protein_g >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'places', 'foods', 'saved_meals', 'meal_logs',
    'strava_connections', 'workouts', 'day_targets', 'weigh_ins', 'eval_cases'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: owner-only access on every user table
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'places', 'foods', 'saved_meals', 'meal_logs',
    'workouts', 'day_targets', 'weigh_ins', 'eval_cases'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Owner can select" on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Owner can insert" on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Owner can update" on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Owner can delete" on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- Profiles are created by the trigger; users can't insert a second one.
drop policy "Owner can insert" on public.profiles;

-- ai_calls: users may read their own call log and the server (acting as the
-- user) may insert; rows are never edited by clients.
alter table public.ai_calls enable row level security;
create policy "Owner can select" on public.ai_calls for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owner can insert" on public.ai_calls for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- strava_connections: the row is the user's, but token columns must never be
-- readable from the browser. Allow reading only non-secret columns.
alter table public.strava_connections enable row level security;
create policy "Owner can select" on public.strava_connections for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owner can delete" on public.strava_connections for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.strava_connections from anon, authenticated;
grant select (user_id, athlete_id, expires_at, scopes, created_at, updated_at)
  on public.strava_connections to authenticated;
grant delete on public.strava_connections to authenticated;
-- Inserts/updates with tokens happen in the Strava OAuth server route
-- (Milestone 4), which will document its access path.

-- Nothing here is for signed-out visitors.
revoke all on all tables in schema public from anon;
