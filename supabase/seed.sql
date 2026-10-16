-- ============================================================================
-- Splinter Mind — demo seed
-- Demo org "Demo Exchange Group" with branches #1, #2, #3, #7, #14, mock
-- cameras, employees/shifts, exchange rates, cash balances, and a set of
-- events + alerts matching the dashboard example in the product brief.
--
-- NOTE: public.users.id references auth.users(id). Create matching auth
-- users first (Supabase Auth admin API / dashboard) with the UUIDs below,
-- otherwise the user inserts will fail on the foreign key:
--   owner       aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa  (owner@demo.exchange)
--   coordinator bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb  (ops@demo.exchange)
--   security    cccccccc-cccc-cccc-cccc-cccccccccccc  (sec@demo.exchange)
-- Run: psql $DATABASE_URL -f supabase/seed.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------- org ----
insert into public.organizations (id, name, status)
values ('11111111-1111-1111-1111-111111111111', 'Demo Exchange Group', 'active')
on conflict (id) do nothing;

-- -------------------------------------------------------------- users ----
insert into public.users (id, organization_id, name, email, phone, role, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Demo Owner', 'owner@demo.exchange', '+996700000001', 'owner', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111',
   'Aiperi (Coordinator)', 'ops@demo.exchange', '+996700000002', 'coordinator', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111',
   'Bakyt (Security)', 'sec@demo.exchange', '+996700000003', 'security', 'active')
on conflict (id) do update set
  organization_id = excluded.organization_id, name = excluded.name,
  email = excluded.email, phone = excluded.phone, role = excluded.role, status = excluded.status;

-- ------------------------------------------------------------ branches ----
-- working_hours: Mon-Fri 09:00-18:00, Sat 10:00-14:00, Sun closed (Asia/Bishkek)
insert into public.branches (id, organization_id, name, address, latitude, longitude, timezone, status, working_hours)
values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111',
   'Branch #1', '123 Sovetskaya St, Bishkek', 42.8746, 74.5698, 'Asia/Bishkek', 'active',
   '{"mon":{"open":"09:00","close":"18:00"},"tue":{"open":"09:00","close":"18:00"},"wed":{"open":"09:00","close":"18:00"},"thu":{"open":"09:00","close":"18:00"},"fri":{"open":"09:00","close":"18:00"},"sat":{"open":"10:00","close":"14:00"},"sun":{"closed":true}}'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111',
   'Branch #2', '45 Manas Ave, Bishkek', 42.8820, 74.5750, 'Asia/Bishkek', 'active',
   '{"mon":{"open":"09:00","close":"18:00"},"tue":{"open":"09:00","close":"18:00"},"wed":{"open":"09:00","close":"18:00"},"thu":{"open":"09:00","close":"18:00"},"fri":{"open":"09:00","close":"18:00"},"sat":{"open":"10:00","close":"14:00"},"sun":{"closed":true}}'),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111',
   'Branch #3', '7 Kurmanjan Datka St, Osh', 40.5283, 72.7985, 'Asia/Bishkek', 'active',
   '{"mon":{"open":"09:00","close":"18:00"},"tue":{"open":"09:00","close":"18:00"},"wed":{"open":"09:00","close":"18:00"},"thu":{"open":"09:00","close":"18:00"},"fri":{"open":"09:00","close":"18:00"},"sat":{"open":"10:00","close":"14:00"},"sun":{"closed":true}}'),
  ('22222222-2222-2222-2222-222222222207', '11111111-1111-1111-1111-111111111111',
   'Branch #7', '210 Chuy Ave, Bishkek', 42.8780, 74.5950, 'Asia/Bishkek', 'active',
   '{"mon":{"open":"09:00","close":"18:00"},"tue":{"open":"09:00","close":"18:00"},"wed":{"open":"09:00","close":"18:00"},"thu":{"open":"09:00","close":"18:00"},"fri":{"open":"09:00","close":"18:00"},"sat":{"open":"10:00","close":"14:00"},"sun":{"closed":true}}'),
  ('22222222-2222-2222-2222-222222222214', '11111111-1111-1111-1111-111111111111',
   'Branch #14', '88 Sovietskaya St, Karakol', 42.4907, 78.3936, 'Asia/Bishkek', 'active',
   '{"mon":{"open":"09:00","close":"18:00"},"tue":{"open":"09:00","close":"18:00"},"wed":{"open":"09:00","close":"18:00"},"thu":{"open":"09:00","close":"18:00"},"fri":{"open":"09:00","close":"18:00"},"sat":{"open":"10:00","close":"14:00"},"sun":{"closed":true}}')
on conflict (id) do nothing;

-- ------------------------------------------------------------- cameras ----
insert into public.cameras (id, organization_id, branch_id, name, external_id, provider, status, camera_type, last_seen_at, configuration)
values
  ('33333333-3333-3333-3333-333333333311', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222201', 'Entrance', 'mock-b1-cam1', 'mock', 'online', 'dome', now(), '{"channel":101}'),
  ('33333333-3333-3333-3333-333333333312', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222201', 'Cashier Area', 'mock-b1-cam2', 'mock', 'online', 'bullet', now(), '{"channel":102}'),
  ('33333333-3333-3333-3333-333333333321', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222202', 'Entrance', 'mock-b2-cam1', 'mock', 'online', 'dome', now(), '{"channel":101}'),
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222203', 'Entrance', 'mock-b3-cam1', 'mock', 'online', 'dome', now(), '{"channel":101}'),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222203', 'Cashier Area', 'mock-b3-cam2', 'mock', 'online', 'bullet', now(), '{"channel":102}'),
  ('33333333-3333-3333-3333-333333333371', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222207', 'Entrance', 'mock-b7-cam1', 'mock', 'offline', 'dome', now() - interval '17 minutes', '{"channel":101}'),
  ('33333333-3333-3333-3333-333333333372', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222207', 'Cashier Area', 'mock-b7-cam2', 'mock', 'online', 'bullet', now(), '{"channel":102}'),
  ('33333333-3333-3333-3333-333333333381', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222214', 'Entrance', 'mock-b14-cam1', 'mock', 'online', 'dome', now(), '{"channel":101}'),
  ('33333333-3333-3333-3333-333333333382', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222214', 'Cashier Area', 'mock-b14-cam2', 'mock', 'online', 'bullet', now(), '{"channel":102}')
on conflict (id) do nothing;

-- ----------------------------------------------------------- employees ----
insert into public.employees (id, organization_id, branch_id, name, phone, role, status)
values
  ('44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222214', 'Aibek', '+996700000101', 'cashier', 'active'),
  ('44444444-4444-4444-4444-444444444402', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222207', 'Meerim', '+996700000102', 'cashier', 'active'),
  ('44444444-4444-4444-4444-444444444403', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222201', 'Timur', '+996700000103', 'manager', 'active')
on conflict (id) do nothing;

insert into public.shifts (id, organization_id, branch_id, employee_id, start_time, end_time, status)
values
  ('55555555-5555-5555-5555-555555555501', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222214', '44444444-4444-4444-4444-444444444401',
   now() - interval '3 hours', now() + interval '5 hours', 'active'),
  ('55555555-5555-5555-5555-555555555502', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222207', '44444444-4444-4444-4444-444444444402',
   now() - interval '3 hours', now() + interval '5 hours', 'active')
on conflict (id) do nothing;

-- ------------------------------------------------------ exchange rates ----
insert into public.exchange_rates (organization_id, branch_id, currency, buy_rate, sell_rate, updated_by)
values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222201', 'USD', 86.20, 87.00, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222201', 'EUR', 99.20, 100.50, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222201', 'RUB', 1.05, 1.12, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222201', 'GBP', 108.40, 110.20, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222202', 'USD', 86.10, 87.10, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222202', 'EUR', 99.00, 100.70, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222214', 'USD', 86.20, 87.00, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222214', 'EUR', 99.20, 100.50, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222207', 'USD', 86.25, 86.95, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222207', 'EUR', 99.30, 100.40, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (branch_id, currency) do update set
  buy_rate = excluded.buy_rate, sell_rate = excluded.sell_rate,
  previous_buy_rate = public.exchange_rates.buy_rate,
  previous_sell_rate = public.exchange_rates.sell_rate,
  updated_by = excluded.updated_by, created_at = now();

-- Branch #3 USD rate is stale on purpose (rate-not-synchronized demo)
insert into public.exchange_rates (organization_id, branch_id, currency, buy_rate, sell_rate, updated_by, created_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222203',
        'USD', 86.20, 87.00, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '26 hours')
on conflict (branch_id, currency) do update set created_at = now() - interval '26 hours';

-- ------------------------------------------------------- cash balances ----
insert into public.cash_balances (organization_id, branch_id, currency, amount, threshold)
values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222214', 'USD', 24500, 5000),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222214', 'EUR', 12400, 3000),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222201', 'USD', 18200, 5000),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222201', 'EUR', 9600, 3000),
  -- Branch #2 USD is BELOW threshold on purpose (warning demo)
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222202', 'USD', 3200, 5000),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222207', 'USD', 15800, 5000)
on conflict (branch_id, currency) do update set
  amount = excluded.amount, threshold = excluded.threshold, updated_at = now();

-- ---------------------------------------------------------------- events ----
-- Most recent 02:17 branch-local time (for the after-hours intrusion demo)
do $$
declare v_intrusion_ts timestamptz;
begin
  v_intrusion_ts := ((timezone('Asia/Bishkek', now()))::date + interval '2 hours 17 minutes') at time zone 'Asia/Bishkek');
  if v_intrusion_ts > now() then
    v_intrusion_ts := v_intrusion_ts - interval '1 day';
  end if;

  insert into public.events (id, organization_id, branch_id, camera_id, event_type, source, severity, timestamp, raw_payload, ai_analysis, dedupe_key, processed_at)
  values
    ('66666666-6666-6666-6666-666666666601', '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222214', '33333333-3333-3333-3333-333333333382',
     'intrusion', 'hikvision', 'high', v_intrusion_ts,
     '{"channel": 102, "note": "demo intrusion event"}',
     '{"person_detected": true, "restricted_area": true, "outside_working_hours": true, "confidence": 0.94, "risk_level": "high", "summary": "A person appears to be present in the cashier area outside working hours.", "objects_visible": ["person"], "likely_false_positive": false}',
     'seed:intrusion:b14', now()),
    ('66666666-6666-6666-6666-666666666602', '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222207', '33333333-3333-3333-3333-333333333371',
     'camera_offline', 'hikvision', 'medium', now() - interval '17 minutes',
     '{"last_seen": "signal lost"}', null, 'seed:offline:b7', now()),
    ('66666666-6666-6666-6666-666666666603', '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222203', null,
     'rate_not_updated', 'rule_engine', 'medium', now() - interval '2 hours',
     '{"currency": "USD", "hours_since_update": 26}', null, 'seed:rate:b3', now()),
    ('66666666-6666-6666-6666-666666666604', '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222202', null,
     'cash_below_threshold', 'rule_engine', 'medium', now() - interval '45 minutes',
     '{"currency": "USD", "amount": 3200, "threshold": 5000}', null, 'seed:cash:b2', now()),
    ('66666666-6666-6666-6666-666666666605', '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333311',
     'motion_detected', 'hikvision', 'low', now() - interval '5 hours',
     '{"note": "after-hours motion, AI cleared as low risk"}',
     '{"person_detected": false, "restricted_area": false, "outside_working_hours": true, "confidence": 0.81, "risk_level": "low", "summary": "No person detected in the entrance area. Nothing unusual observed.", "objects_visible": [], "likely_false_positive": true}',
     'seed:motion:b1', now())
  on conflict (dedupe_key) do nothing;
end $$;

-- ---------------------------------------------------------------- alerts ----
insert into public.alerts (id, organization_id, branch_id, event_id, title, description, severity, status, created_at, acknowledged_at)
values
  ('77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222214', '66666666-6666-6666-6666-666666666601',
   'Security event detected',
   'Person detected in the cashier area outside working hours. AI risk: high (confidence 0.94). Potentially suspicious event requiring human review.',
   'critical', 'open', now() - interval '30 minutes', null),
  ('77777777-7777-7777-7777-777777777702', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222207', '66666666-6666-6666-6666-666666666602',
   'Camera offline',
   'Entrance camera has been offline for 17 minutes.',
   'high', 'open', now() - interval '17 minutes', null),
  ('77777777-7777-7777-7777-777777777703', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222203', '66666666-6666-6666-6666-666666666603',
   'Exchange rate not synchronized',
   'USD rates at this branch have not been updated for 26 hours.',
   'medium', 'open', now() - interval '2 hours', null),
  ('77777777-7777-7777-7777-777777777704', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222202', '66666666-6666-6666-6666-666666666604',
   'USD balance below threshold',
   'USD balance $3,200 is below the configured threshold of $5,000.',
   'medium', 'acknowledged', now() - interval '45 minutes', now() - interval '20 minutes')
on conflict (id) do nothing;

insert into public.alert_notes (organization_id, alert_id, user_id, note)
values ('11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777704',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Called the branch, cashier is arranging a top-up from the head office.')
on conflict (id) do nothing;

-- ---------------------------------------------------- notification prefs ----
insert into public.notification_prefs (user_id, push_enabled, severities, quiet_hours)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true, array['critical','high','medium','low'],
   '{"start":"23:00","end":"07:00","timezone":"Asia/Bishkek"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', true, array['critical','high'],
   '{"start":"23:00","end":"07:00","timezone":"Asia/Bishkek"}')
on conflict (user_id) do update set
  push_enabled = excluded.push_enabled, severities = excluded.severities, quiet_hours = excluded.quiet_hours;

-- Fake Expo token for the demo coordinator (replace with a real token on device)
insert into public.push_tokens (user_id, expo_push_token)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ExponentPushToken[demo-coordinator-token]')
on conflict do nothing;

-- ---------------------------------------------------------- default rules ----
select public.seed_default_rules('11111111-1111-1111-1111-111111111111');

commit;
