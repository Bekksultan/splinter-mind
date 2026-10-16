-- 0004_devices.sql — registered Hikvision NVR/camera devices (Phase 2B).
--
-- A "device" is one reachable ISAPI endpoint (typically an NVR). Its
-- credentials live in Supabase Vault (credentials_ref = vault secret id);
-- the password itself is NEVER stored in this table.

-- Vault extension (secret storage). No-op if already present.
create extension if not exists "supabase_vault" with schema "vault";

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  provider text not null default 'hikvision',
  host text not null,
  port integer not null default 80,
  use_https boolean not null default false,
  username text,
  credentials_ref text,
  status text not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devices_org_idx on public.devices (organization_id);
create index if not exists devices_branch_idx on public.devices (branch_id);
-- one ISAPI endpoint per branch (same NVR reachable via two hosts is a user error)
create unique index if not exists devices_branch_host_uidx
  on public.devices (branch_id, host);

create trigger trg_touch_devices before update on public.devices
  for each row execute function public.touch_updated_at();

-- RLS: tenant isolation, same pattern as the other org tables.
alter table public.devices enable row level security;
drop policy if exists tenant_all on public.devices;
create policy tenant_all on public.devices for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

-- ---------------------------------------------------------------------------
-- store_device_secret: SECURITY DEFINER wrapper around vault.create_secret.
-- Called ONLY by the hikvision-onboard edge function (service_role).
-- Revoked from anon/authenticated so it is not reachable via PostgREST.
-- ---------------------------------------------------------------------------
create or replace function public.store_device_secret(
  p_secret text,
  p_name text,
  p_description text default ''
) returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if p_secret is null or length(p_secret) = 0 then
    raise exception 'store_device_secret: empty secret';
  end if;
  select vault.create_secret(p_secret, p_name, p_description) into v_id;
  return v_id;
end $$;

revoke all on function public.store_device_secret(text, text, text) from public;
revoke all on function public.store_device_secret(text, text, text) from anon;
revoke all on function public.store_device_secret(text, text, text) from authenticated;
