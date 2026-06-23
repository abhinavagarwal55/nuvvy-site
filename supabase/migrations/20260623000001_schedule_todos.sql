-- ─── Schedule To-Do List (V1) ──────────────────────────────────────────────
--
-- A lightweight, shared reminder list pinned to the top of /ops/schedule.
-- Anyone on the ops team (admin + horticulturist) can jot a follow-up and tick
-- it off. We record who added it, when, who completed it, and when — so nothing
-- silently slips and there's an audit trail. Free text, not a ticketing system.
--
-- States: open ──tick──▶ done ──untick──▶ open. Either state can be soft-deleted
-- (deleted_at set) — we never hard-delete; history is retained for audit.
--
-- Integrity (completed_by/at paired with status='done', deleted_by paired with
-- deleted_at) is enforced at the API layer, consistent with other ops tables.

CREATE TABLE IF NOT EXISTS public.schedule_todos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text          text NOT NULL CHECK (char_length(trim(text)) BETWEEN 1 AND 500),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_by  uuid REFERENCES public.profiles(id),
  completed_at  timestamptz,
  deleted_at    timestamptz,              -- soft delete; NULL = active
  deleted_by    uuid REFERENCES public.profiles(id)
);

-- Query path: list active items ordered newest-first, partitioned by status.
CREATE INDEX IF NOT EXISTS schedule_todos_active_idx
  ON public.schedule_todos (status, created_at DESC)
  WHERE deleted_at IS NULL;

-- RLS enabled, no policies (service-role bypass, consistent with existing ops tables).
ALTER TABLE public.schedule_todos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.schedule_todos IS
  'Shared ops to-do list pinned to /ops/schedule. Soft-delete only; admin + horticulturist via service-role API.';
