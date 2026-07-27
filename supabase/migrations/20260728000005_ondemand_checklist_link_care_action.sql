-- On-Demand Service — keep the forced fertilizer / neem checklist items in sync
-- with Care Action Names permanently (they ARE the same actions).
--
-- Link the two inactive on-demand checklist_template_items to their
-- care_action_types row. The gardener service GET resolves the localized label
-- from care_action_types LIVE, so editing a translation under Settings → Care
-- Action Names immediately updates the on-demand checklist too — no copy drift.
ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS care_action_type_id uuid REFERENCES public.care_action_types(id);

UPDATE public.checklist_template_items c
   SET care_action_type_id = cat.id
  FROM public.care_action_types cat
 WHERE cat.name = 'fertilizer'
   AND c.is_active = false
   AND c.label IN ('Apply Fertilizer', 'Apply fertilizer');

UPDATE public.checklist_template_items c
   SET care_action_type_id = cat.id
  FROM public.care_action_types cat
 WHERE cat.name = 'neem_oil'
   AND c.is_active = false
   AND c.label IN ('Apply Neem Oil', 'Apply neem oil');
