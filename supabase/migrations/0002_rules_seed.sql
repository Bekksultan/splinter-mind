-- ============================================================================
-- Splinter Mind — 0002 default detection rules
-- seed_default_rules(org_id) installs the sensible MVP rule set for one
-- organization. Called from seed.sql for the demo org and from the
-- organization-provisioning edge function / admin tooling for new orgs.
-- Idempotent: does nothing when the org already has rules.
-- ============================================================================

create or replace function public.seed_default_rules(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.rules where organization_id = p_org_id) then
    return;
  end if;

  insert into public.rules (organization_id, name, event_type, condition, severity, cooldown_minutes, enabled)
  values
    -- Camera health -------------------------------------------------------
    (p_org_id, 'Camera offline > 5 min',
      'camera_offline', '{"offline_minutes_gt": 5}', 'medium', 60, true),
    (p_org_id, 'Camera offline > 30 min (escalation)',
      'camera_offline', '{"offline_minutes_gt": 30}', 'high', 120, true),
    (p_org_id, 'Video loss',
      'video_loss', '{}', 'medium', 60, true),
    (p_org_id, 'Camera tampering',
      'tampering', '{}', 'high', 60, true),

    -- After-hours vision pipeline (AI only when it matters) ---------------
    (p_org_id, 'Motion outside working hours -> AI review',
      'motion_detected', '{"outside_working_hours": true, "needs_ai": true, "min_confidence": 0.7, "risk_levels": ["high", "critical"]}',
      'high', 30, true),
    (p_org_id, 'Person detected outside working hours -> AI review',
      'person_detected', '{"outside_working_hours": true, "needs_ai": true, "min_confidence": 0.6, "risk_levels": ["medium", "high", "critical"]}',
      'high', 30, true),
    (p_org_id, 'Intrusion -> AI review',
      'intrusion', '{"needs_ai": true, "min_confidence": 0.6, "risk_levels": ["medium", "high", "critical"]}',
      'critical', 30, true),
    (p_org_id, 'Restricted area event -> AI review',
      'restricted_area', '{"needs_ai": true, "min_confidence": 0.6, "risk_levels": ["medium", "high", "critical"]}',
      'critical', 30, true),
    (p_org_id, 'Line crossing outside working hours -> AI review',
      'line_crossing', '{"outside_working_hours": true, "needs_ai": true, "min_confidence": 0.7, "risk_levels": ["high", "critical"]}',
      'high', 30, true),

    -- Business rules (deterministic, no AI) --------------------------------
    (p_org_id, 'Cash balance below threshold',
      'cash_below_threshold', '{"amount_below_threshold": true}', 'medium', 240, true),
    (p_org_id, 'Exchange rate deviation > 2%',
      'rate_deviation', '{"deviation_pct_gt": 2}', 'high', 120, true),
    (p_org_id, 'Exchange rate not updated > 24h',
      'rate_not_updated', '{"hours_since_update_gt": 24}', 'medium', 360, true),
    (p_org_id, 'Employee no-show for scheduled shift',
      'shift_no_show', '{}', 'medium', 180, true);
end;
$$;
