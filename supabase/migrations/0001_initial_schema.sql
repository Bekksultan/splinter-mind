-- ============================================================================
-- Splinter Mind — 0001 initial schema
-- Multi-tenant SaaS: every organization table carries organization_id and is
-- protected by Row Level Security. Edge functions use the service_role key
-- (bypasses RLS); the mobile app and any direct Postgres access go through
-- these policies. Never rely on frontend filtering.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums (mirror packages/core/src/types.ts)
-- ---------------------------------------------------------------------------
do $$ begin create type severity as enum ('critical','high','medium','low','info'); exception when duplicate_object then null; end $$;
do $$ begin create type alert_status as enum ('open','acknowledged','resolved','ignored'); exception when duplicate_object then null; end $$;
do $$ begin create type user_role as enum ('owner','admin','coordinator','manager','security','cashier'); exception when duplicate_object then null; end $$;
do $$ begin create type entity_status as enum ('active','inactive','maintenance'); exception when duplicate_object then null; end $$;
do $$ begin create type camera_status as enum ('online','offline','degraded','unknown'); exception when duplicate_object then null; end $$;
do $$ begin create type camera_provider as enum ('hikvision','mock'); exception when duplicate_object then null; end $$;
do $$ begin create type event_type as enum ('motion_detected','line_crossing','intrusion','camera_offline','camera_online','video_loss','tampering','person_detected','vehicle_detected','restricted_area','rate_not_updated','rate_deviation','cash_below_threshold','shift_no_show','info'); exception when duplicate_object then null; end $$;
do $$ begin create type event_source as enum ('hikvision','rule_engine','manual','system'); exception when duplicate_object then null; end $$;
do $$ begin create type shift_status as enum ('scheduled','active','completed','missed','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type audit_action as enum ('login','logout','alert_acknowledged','alert_resolved','alert_ignored','alert_assigned','alert_note_added','alert_created','exchange_rate_changed','camera_config_changed','user_created','user_permissions_changed'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER so policies can read past RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select organization_id from public.users where id = auth.uid()
$$;

create or replace function public.current_user_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.users where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  role user_role not null default 'cashier',
  status entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  timezone text not null default 'UTC',
  status entity_status not null default 'active',
  working_hours jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cameras (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  external_id text,
  provider camera_provider not null default 'hikvision',
  status camera_status not null default 'unknown',
  camera_type text,
  last_seen_at timestamptz,
  configuration jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  phone text,
  role text not null default 'cashier',
  status entity_status not null default 'active',
  schedule jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status shift_status not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  camera_id uuid references public.cameras(id) on delete set null,
  event_type event_type not null,
  source event_source not null default 'system',
  severity severity not null default 'info',
  timestamp timestamptz not null default now(),
  raw_payload jsonb not null default '{}',
  snapshot_url text,
  video_url text,
  ai_analysis jsonb,
  dedupe_key text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dedupe_key)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  event_id uuid unique references public.events(id) on delete set null,
  title text not null,
  description text,
  severity severity not null default 'info',
  status alert_status not null default 'open',
  assigned_to uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

create table if not exists public.alert_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_id uuid not null references public.alerts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  currency text not null,
  buy_rate numeric(18,6) not null,
  sell_rate numeric(18,6) not null,
  previous_buy_rate numeric(18,6),
  previous_sell_rate numeric(18,6),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (branch_id, currency)
);

create table if not exists public.cash_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  currency text not null,
  amount numeric(18,2) not null default 0,
  threshold numeric(18,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (branch_id, currency)
);

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  event_type event_type not null,
  condition jsonb not null default '{}',
  severity severity not null default 'info',
  cooldown_minutes integer not null default 30,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.rule_fires (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid not null references public.rules(id) on delete cascade,
  cooldown_key text not null,
  fired_at timestamptz not null default now()
);
create index if not exists rule_fires_rule_key_idx on public.rule_fires (rule_id, cooldown_key, fired_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  action audit_action not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

create table if not exists public.notification_prefs (
  user_id uuid primary key references public.users(id) on delete cascade,
  push_enabled boolean not null default true,
  severities text[] not null default array['critical','high','medium','low'],
  quiet_hours jsonb
);

create table if not exists public.push_tokens (
  user_id uuid not null references public.users(id) on delete cascade,
  expo_push_token text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, expo_push_token)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists events_org_time_idx on public.events (organization_id, timestamp desc);
create index if not exists events_branch_idx on public.events (branch_id, timestamp desc);
create index if not exists events_camera_idx on public.events (camera_id, timestamp desc);
create index if not exists events_unprocessed_idx on public.events (organization_id) where processed_at is null;
create index if not exists alerts_org_status_idx on public.alerts (organization_id, status, created_at desc);
create index if not exists alerts_branch_idx on public.alerts (branch_id, status);
create index if not exists cameras_branch_idx on public.cameras (branch_id);
create index if not exists cameras_external_idx on public.cameras (organization_id, external_id);
create index if not exists shifts_branch_time_idx on public.shifts (branch_id, start_time);
create index if not exists rates_branch_idx on public.exchange_rates (branch_id);
create index if not exists cash_branch_idx on public.cash_balances (branch_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$ begin
  create trigger trg_touch_organizations before update on public.organizations
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_touch_users before update on public.users
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_touch_branches before update on public.branches
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_touch_cameras before update on public.cameras
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_touch_employees before update on public.employees
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_touch_cash before update on public.cash_balances
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Audit trigger: alert status / assignment changes always write audit_logs.
-- Runs as SECURITY DEFINER so it works even when the caller cannot insert
-- into audit_logs directly. auth.uid() identifies the human actor.
-- ---------------------------------------------------------------------------
create or replace function public.log_alert_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action audit_action;
begin
  if new.status is distinct from old.status then
    v_action := case new.status
      when 'acknowledged' then 'alert_acknowledged'::audit_action
      when 'resolved'      then 'alert_resolved'::audit_action
      when 'ignored'       then 'alert_ignored'::audit_action
      else null
    end;
    if v_action is not null then
      insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
      values (new.organization_id, auth.uid(), v_action, 'alert', new.id,
              jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
    values (new.organization_id, auth.uid(), 'alert_assigned'::audit_action, 'alert', new.id,
            jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
  end if;
  return new;
end $$;

do $$ begin
  create trigger trg_alert_audit after update on public.alerts
    for each row execute function public.log_alert_change();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Server-side RBAC guard for direct alert updates.
-- service_role (edge functions, auth.uid() IS NULL) bypasses; every human
-- session must hold an operational role. Cashiers cannot touch alerts.
-- ---------------------------------------------------------------------------
create or replace function public.guard_alert_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- service_role / edge functions
  end if;
  if public.current_user_role() not in ('owner','admin','coordinator','manager','security') then
    raise exception 'insufficient role to modify alerts';
  end if;
  return new;
end $$;

do $$ begin
  create trigger trg_alert_guard before update on public.alerts
    for each row execute function public.guard_alert_update();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations   enable row level security;
alter table public.users           enable row level security;
alter table public.branches        enable row level security;
alter table public.cameras         enable row level security;
alter table public.employees       enable row level security;
alter table public.shifts          enable row level security;
alter table public.events          enable row level security;
alter table public.alerts          enable row level security;
alter table public.alert_notes     enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.cash_balances   enable row level security;
alter table public.rules           enable row level security;
alter table public.rule_fires      enable row level security;
alter table public.audit_logs      enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.push_tokens     enable row level security;

-- organizations: members see their own org; owner/admin may update it
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select
  using (id = public.current_org_id());
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update
  using (id = public.current_org_id() and public.current_user_role() in ('owner','admin'))
  with check (id = public.current_org_id());

-- users: read own row; operational roles read org users (coordinators must be
-- able to list colleagues for alert assignment); owner/admin manage them
drop policy if exists users_select on public.users;
create policy users_select on public.users for select
  using (
    id = auth.uid()
    or (organization_id = public.current_org_id()
        and public.current_user_role() in ('owner','admin','coordinator','manager','security'))
  );
drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('owner','admin')
  );
drop policy if exists users_update on public.users;
create policy users_update on public.users for update
  using (
    id = auth.uid()
    or (organization_id = public.current_org_id()
        and public.current_user_role() in ('owner','admin'))
  )
  with check (
    organization_id = public.current_org_id()
  );
drop policy if exists users_delete on public.users;
create policy users_delete on public.users for delete
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('owner','admin')
  );

-- Generic tenant-isolated tables: full access scoped to the caller's org.
-- (service_role bypasses RLS for edge functions.)
do $$
declare t text;
begin
  foreach t in array array[
    'branches','cameras','employees','shifts','events','alerts','alert_notes',
    'exchange_rates','cash_balances','rules'
  ] loop
    execute format('drop policy if exists tenant_all on public.%I', t);
    execute format(
      'create policy tenant_all on public.%I for all using (organization_id = public.current_org_id()) with check (organization_id = public.current_org_id())',
      t
    );
  end loop;
end $$;

-- audit_logs: tenant read; no direct inserts (trigger + service_role only)
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select
  using (organization_id = public.current_org_id());

-- rule_fires: service_role only (no policies for authenticated = deny all)
-- notification_prefs / push_tokens: users manage only their own rows
drop policy if exists prefs_all on public.notification_prefs;
create policy prefs_all on public.notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists tokens_all on public.push_tokens;
create policy tokens_all on public.push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: private bucket for camera snapshots (signed URLs via edge fn)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('snapshots', 'snapshots', false)
on conflict (id) do nothing;
