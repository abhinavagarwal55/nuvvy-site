-- Per-visit saved reminder message (customer-facing WhatsApp reminder).
--
-- Context: the Visit Reminders page (/ops/schedule/reminders) generates a draft
-- WhatsApp message per upcoming visit from the global template + that customer's
-- due care actions + special tasks. Office staff often tweak an individual
-- message before sending (e.g. add a personal line for a specific customer).
-- Until now those tweaks lived only in browser state and were lost on reload.
--
-- This column holds a saved override for a single visit's reminder. When set, the
-- reminders API returns it as `saved_message` and the UI shows it instead of the
-- freshly-generated draft. Clearing it (Reset to template) sets it back to NULL,
-- so the message falls back to the generated draft again.
--
-- Distinct from the global template in system_config (which affects every visit).

ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS reminder_message_override text,
  ADD COLUMN IF NOT EXISTS reminder_message_updated_at timestamptz;

COMMENT ON COLUMN public.service_visits.reminder_message_override IS
  'Saved per-visit override of the customer WhatsApp reminder. NULL = use the generated draft.';
