-- Phase 2A: WhatsApp notification channel (optional, per-user).
-- Adds the recipient number + opt-in flag to notification_prefs.
-- The send-notification edge function reads these (service_role) and sends
-- approved Meta template messages; RLS already restricts rows to their owner
-- (prefs_all policy on user_id = auth.uid()).

alter table public.notification_prefs
  add column if not exists whatsapp_number text,
  add column if not exists whatsapp_enabled boolean not null default false;
