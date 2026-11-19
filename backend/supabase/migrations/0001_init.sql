-- =============================================================================
-- VoltSplit · 0001_init
-- Schema, constraints, indexes, triggers, Row Level Security, storage buckets.
-- See docs/03-backend.md for the design rationale.
-- =============================================================================

-- ---------------------------------------------------------------- enums
create type public.controller_kind as enum ('battery', 'rule', 'mpc', 'ml');
create type public.cycle_source    as enum ('synthetic', 'upload', 'dataset');
create type public.model_kind      as enum ('forecaster', 'loss-bat', 'loss-sc', 'policy');
create type public.model_status    as enum ('training', 'candidate', 'active', 'archived');

-- ---------------------------------------------------------------- helpers
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text check (char_length(display_name) <= 80),
  active_vehicle_id text,                 -- FK added after vehicles exists
  run_seq           integer not null default 0 check (run_seq >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- vehicles
create table public.vehicles (
  id          text primary key default gen_random_uuid()::text,
  owner_id    uuid references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 120),
  config      jsonb not null check (
                jsonb_typeof(config) = 'object'
                and config ? 'vehicle' and config ? 'battery' and config ? 'supercap'),
  is_builtin  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint vehicles_owner_builtin check (
    (is_builtin and owner_id is null) or (not is_builtin and owner_id is not null))
);
create index vehicles_owner_idx on public.vehicles (owner_id);
create trigger vehicles_touch before update on public.vehicles
  for each row execute function public.touch_updated_at();

alter table public.profiles
  add constraint profiles_active_vehicle_fk foreign key (active_vehicle_id)
  references public.vehicles (id) on delete set null;

-- ---------------------------------------------------------------- drive cycles
create table public.drive_cycles (
  id          text primary key default gen_random_uuid()::text,
  owner_id    uuid references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 160),
  source      public.cycle_source not null,
  speed_ms    real[] not null check (cardinality(speed_ms) between 10 and 14400),  -- 1 Hz, ≤ 4 h
  grade       real[] check (grade is null or cardinality(grade) = cardinality(speed_ms)),
  duration_s  integer generated always as (cardinality(speed_ms)) stored,
  created_at  timestamptz not null default now(),
  constraint drive_cycles_owner_source check (
    (source = 'upload' and owner_id is not null) or (source <> 'upload' and owner_id is null))
);
create index drive_cycles_owner_idx on public.drive_cycles (owner_id);

-- ---------------------------------------------------------------- runs
create table public.runs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seq          integer not null default 0,
  vehicle_id   text references public.vehicles (id) on delete set null,
  vehicle_name text not null,
  config       jsonb not null,                       -- snapshot at run time
  cycle_id     text references public.drive_cycles (id) on delete set null,
  cycle_name   text not null,
  controller   public.controller_kind not null,
  init         jsonb not null,
  kpis         jsonb not null,
  baseline     jsonb not null,
  compute_ms   real not null default 0 check (compute_ms >= 0),
  created_at   timestamptz not null default now(),
  constraint runs_owner_seq_key unique (owner_id, seq)
);
create index runs_owner_created_idx on public.runs (owner_id, created_at desc);
create index runs_cycle_idx   on public.runs (cycle_id);
create index runs_vehicle_idx on public.runs (vehicle_id);

-- Per-user run numbering (#1, #2, …) from the profile counter.
create or replace function public.assign_run_seq()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set run_seq = run_seq + 1
   where id = new.owner_id
   returning run_seq into new.seq;
  if new.seq is null or new.seq = 0 then
    raise exception 'profile missing for user %', new.owner_id;
  end if;
  return new;
end $$;

create trigger runs_assign_seq before insert on public.runs
  for each row execute function public.assign_run_seq();

-- ---------------------------------------------------------------- models
-- Written only by the model-training pipeline (secret key, bypasses RLS).
create table public.models (
  id            uuid primary key default gen_random_uuid(),
  kind          public.model_kind not null,
  version       text not null check (char_length(version) between 1 and 32),
  status        public.model_status not null default 'candidate',
  metrics       jsonb not null default '{}'::jsonb,
  artifact_path text,                                -- storage path in bucket `models`
  notes         text,
  trained_at    timestamptz not null default now(),
  constraint models_kind_version_key unique (kind, version)
);
create unique index models_one_active_per_kind on public.models (kind) where status = 'active';

-- ---------------------------------------------------------------- RLS
alter table public.profiles     enable row level security;
alter table public.vehicles     enable row level security;
alter table public.drive_cycles enable row level security;
alter table public.runs         enable row level security;
alter table public.models       enable row level security;

-- profiles: a user sees and edits only their own row (run_seq is guarded by a trigger below)
create policy "profiles: read own"   on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create or replace function public.guard_profile_update()
returns trigger language plpgsql as $$
begin
  -- run_seq is maintained by assign_run_seq() only
  if current_user in ('authenticated', 'anon') then
    new.run_seq := old.run_seq;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- vehicles: built-ins are readable by everyone signed in; user vehicles are private
create policy "vehicles: read builtin or own" on public.vehicles for select to authenticated
  using (is_builtin or owner_id = (select auth.uid()));
create policy "vehicles: insert own" on public.vehicles for insert to authenticated
  with check (owner_id = (select auth.uid()) and not is_builtin);
create policy "vehicles: update own" on public.vehicles for update to authenticated
  using (owner_id = (select auth.uid()) and not is_builtin)
  with check (owner_id = (select auth.uid()) and not is_builtin);
create policy "vehicles: delete own" on public.vehicles for delete to authenticated
  using (owner_id = (select auth.uid()) and not is_builtin);

-- drive cycles: shared (synthetic/dataset) + own uploads; uploads are immutable
create policy "cycles: read shared or own" on public.drive_cycles for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "cycles: insert own upload" on public.drive_cycles for insert to authenticated
  with check (owner_id = (select auth.uid()) and source = 'upload');
create policy "cycles: delete own" on public.drive_cycles for delete to authenticated
  using (owner_id = (select auth.uid()));

-- runs: fully private; results are immutable once written
create policy "runs: read own"   on public.runs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "runs: insert own" on public.runs for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "runs: delete own" on public.runs for delete to authenticated
  using (owner_id = (select auth.uid()));

-- models: read-only for signed-in users
create policy "models: read" on public.models for select to authenticated using (true);

-- anon role gets nothing
revoke all on public.profiles, public.vehicles, public.drive_cycles, public.runs, public.models from anon;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('models',  'models',  false, 52428800),   -- trained model artifacts (50 MB)
  ('exports', 'exports', false, 10485760)    -- C / JS controller exports (10 MB)
on conflict (id) do nothing;

create policy "storage: signed-in users read models and exports"
  on storage.objects for select to authenticated
  using (bucket_id in ('models', 'exports'));
-- Writes happen only through the secret key (model-training pipeline).
