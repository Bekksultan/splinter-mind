# RLS / Security Test Checklist

pgTAP is not available in this environment, so these are the manual SQL checks
to run against a staging project after `supabase db push` + `seed.sql`.
Run each block as the indicated role. `service_role` bypasses RLS everywhere
(edge functions rely on this).

Setup: create two orgs (A, B) with one user each, plus data in both.
Replace the UUIDs with real ones from your database.

```sql
-- helper: act as an authenticated user
-- (in the SQL editor, use the "authenticated" role + set request.jwt.claims)
```

## 1. Tenant isolation (the critical boundary)

As user of **Org A**:

```sql
-- must return ZERO rows from Org B's tables
select count(*) from branches where organization_id = '<ORG_B>';      -- expect 0
select count(*) from cameras  where organization_id = '<ORG_B>';      -- expect 0
select count(*) from events   where organization_id = '<ORG_B>';      -- expect 0
select count(*) from alerts   where organization_id = '<ORG_B>';      -- expect 0
select count(*) from exchange_rates where organization_id = '<ORG_B>';-- expect 0
select count(*) from cash_balances  where organization_id = '<ORG_B>';-- expect 0
select count(*) from employees where organization_id = '<ORG_B>';      -- expect 0
select count(*) from audit_logs where organization_id = '<ORG_B>';    -- expect 0

-- own org visible
select count(*) from branches where organization_id = '<ORG_A>';      -- expect > 0

-- cross-org write must fail (0 rows affected / RLS violation)
update alerts set status='ignored' where organization_id = '<ORG_B>'; -- expect 0 rows
insert into branches (organization_id, name) values ('<ORG_B>', 'evil'); -- expect RLS error
```

## 2. users table

```sql
-- as coordinator of Org A: can read own row, cannot list org users
select * from users where id = auth.uid();            -- 1 row
select * from users where organization_id = '<ORG_A>'; -- 1 row (self only)

-- as owner of Org A: can list org users
select count(*) from users where organization_id = '<ORG_A>'; -- all org users

-- as Org A user: Org B users invisible
select count(*) from users where organization_id = '<ORG_B>'; -- 0
```

## 3. Alert RBAC guard

```sql
-- as cashier: direct status change must raise 'insufficient role to modify alerts'
update alerts set status='resolved' where id = '<ALERT_A>'; -- expect ERROR

-- as coordinator: allowed
update alerts set status='acknowledged' where id = '<ALERT_A>'; -- 1 row

-- illegal transition is still blocked by the app layer (assertAlertTransition);
-- DB accepts any enum value — verify the edge function / mobile rejects
-- resolved -> open before relying on it.
```

## 4. Audit trigger

```sql
-- as coordinator:
update alerts set status='acknowledged' where id = '<ALERT_A>';
select action, user_id, entity_id, metadata
  from audit_logs
 where entity_id = '<ALERT_A>' order by created_at desc limit 1;
-- expect: action='alert_acknowledged', user_id = coordinator's id,
--         metadata = {"from":"open","to":"acknowledged"}

update alerts set assigned_to = '<USER_A>' where id = '<ALERT_A>';
-- expect newest audit_logs row: action='alert_assigned'
```

## 5. Notification prefs / push tokens

```sql
-- as user X: can only see own rows
select * from notification_prefs; -- only own row
select * from push_tokens;        -- only own rows

-- another user's token invisible even with the exact token string
select * from push_tokens where user_id = '<OTHER_USER>'; -- 0 rows
```

## 6. Storage bucket

- `snapshots` bucket is **private** (no public read policy).
- `storage.objects` has no permissive policies: anonymous/authenticated
  selects return 0 rows; only `service_role` (edge functions) can upload and
  mint signed URLs.

## 7. Webhook auth

```bash
# no signature -> 401, nothing stored
curl -X POST $URL/functions/v1/hikvision-webhook -d '{}' # 401

# wrong secret -> 401
# correct HMAC -> 202 (see docs/API.md)
```

## 8. Simulate gating

```bash
curl -X POST $URL/functions/v1/simulate -d '{"scenario":"low_cash"}' # 403 unless ALLOW_SIMULATE=true
```
