-- Society & Unit Visibility + Societies Management (PRD 2026-07-01)
-- Adds a generic customer unit number and society metadata. All columns are
-- nullable; no backfill; customers.address is left untouched.

ALTER TABLE public.customers  ADD COLUMN IF NOT EXISTS unit_number  text;
ALTER TABLE public.societies  ADD COLUMN IF NOT EXISTS short_name   text;
ALTER TABLE public.societies  ADD COLUMN IF NOT EXISTS address      text;
ALTER TABLE public.societies  ADD COLUMN IF NOT EXISTS total_units  integer;
ALTER TABLE public.societies  ADD COLUMN IF NOT EXISTS contact_info text;
