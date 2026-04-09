-- Migration: Checklist V2 + Client Request support
-- 1. Deactivate old checklist template items, insert new 6-item checklist
-- 2. Add 'client_request' to requests type constraint
-- 3. Add issue_type column to requests

-- ─── 1. Checklist template items ──────────────────────────────────────────────
-- Deactivate all existing items (preserves history for already-generated checklists)
UPDATE public.checklist_template_items SET is_active = false WHERE is_active = true;

-- Insert the new 6-item checklist
INSERT INTO public.checklist_template_items (label, category, is_required, is_active, order_index)
VALUES
  ('Checked Outdoor plants for yellowing, drooping or sign of pests', 'outdoor', false, true, 1),
  ('Checked Indoor plants for yellowing, drooping or sign of pests',  'indoor',  false, true, 2),
  ('Loosened Soil for aeration',                                       'outdoor', false, true, 3),
  ('Removed dead, infected, dried parts',                              'general', false, true, 4),
  ('Watered the garden',                                               'general', false, true, 5),
  ('Cleaned the pots and balcony area',                                'general', false, true, 6)
ON CONFLICT DO NOTHING;

-- ─── 2. Add 'client_request' to requests type constraint ─────────────────────
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_type_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_type_check
  CHECK (type IN ('problem', 'service_request', 'other', 'client_request'));

-- ─── 3. Add issue_type column to requests ─────────────────────────────────────
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS issue_type text;
