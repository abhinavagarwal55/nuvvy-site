-- ─────────────────────────────────────────
-- LEADS — lightweight lead pipeline (Leads CRM)
-- Own table; does not extend customers. Two user-visible states
-- (active / closed) plus an internal-only `converted` state stamped at
-- the moment of customer creation. See nuvvy-leads-crm-prd.md §3.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                    text NOT NULL,                  -- E.164, e.g. +919876543210
  name                     text,                           -- nullable until known
  state                    text NOT NULL DEFAULT 'active'
                           CHECK (state IN ('active','converted','closed')),
  source                   text
                           CHECK (source IS NULL OR source IN (
                             'balcony_assessment','pricing_inquiry','general_chat',
                             'catalog_shortlist','catalog_plant_request','referral','other'
                           )),
  society_id               uuid REFERENCES public.societies(id),
  area                     text,                           -- free-text until society known
  qualifiers               jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes                    text,                           -- Harshita's freeform narrative (any state)
  next_action              text,                           -- one-line reminder
  next_action_at           date,                           -- optional. Drives "Follow up today".
  closed_reason            text
                           CHECK (closed_reason IS NULL OR closed_reason IN (
                             'outside_service_area','pricing_too_high',
                             'not_meeting_requirements','other'
                           )),
  closed_note              text,                           -- freeform context on close (always optional)
  closed_at                timestamptz,                    -- set on close, cleared on reactivate
  converted_customer_id    uuid REFERENCES public.customers(id),  -- only set when state='converted'
  converted_at             timestamptz,                    -- set on convert
  first_seen_at            timestamptz NOT NULL DEFAULT now(),
  last_touch_at            timestamptz,                    -- updated on note edit / state change
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- Integrity: each state implies (and is implied by) its companion columns
  CONSTRAINT leads_converted_requires_customer
    CHECK ((state = 'converted') = (converted_customer_id IS NOT NULL)),
  CONSTRAINT leads_closed_requires_reason
    CHECK ((state = 'closed') = (closed_reason IS NOT NULL)),
  CONSTRAINT leads_closed_requires_timestamp
    CHECK ((state = 'closed') = (closed_at IS NOT NULL)),
  CONSTRAINT leads_converted_requires_timestamp
    CHECK ((state = 'converted') = (converted_at IS NOT NULL))
);

-- One open lead per phone. Closed/converted leads don't block a new lead for the same phone.
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_active_uniq
  ON public.leads (phone)
  WHERE state = 'active';

CREATE INDEX IF NOT EXISTS leads_state_idx       ON public.leads (state);
CREATE INDEX IF NOT EXISTS leads_next_action_idx ON public.leads (next_action_at) WHERE state = 'active';
CREATE INDEX IF NOT EXISTS leads_last_touch_idx  ON public.leads (last_touch_at DESC);

-- Touch updated_at on row updates (mirrors catalog_products pattern)
CREATE OR REPLACE FUNCTION touch_leads_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS leads_set_updated_at ON public.leads;
CREATE TRIGGER leads_set_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION touch_leads_updated_at();

-- RLS enabled, no policies — API enforces ops auth (matches existing ops-table pattern).
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
