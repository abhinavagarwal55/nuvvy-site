-- On-Demand Service — make the forced fertilizer + neem checklist steps
-- translatable, like every other checklist item. They are represented as proper
-- checklist_template_items (with label_hi / label_kn), so the gardener checklist
-- join resolves the localized label via template_item_id.
--
-- is_active = false → they never appear in the standard (care-plan) checklist,
-- but the join in the gardener service GET does not filter on is_active, so
-- referencing them still yields translations. High order_index avoids clashing
-- with the active template items.
INSERT INTO public.checklist_template_items (label, label_hi, label_kn, is_required, is_active, order_index, needs_translation_review)
SELECT 'Apply fertilizer', 'खाद डालें', 'ಗೊಬ್ಬರ ಹಾಕಿ', true, false, 101, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.checklist_template_items WHERE label = 'Apply fertilizer' AND is_active = false
);

INSERT INTO public.checklist_template_items (label, label_hi, label_kn, is_required, is_active, order_index, needs_translation_review)
SELECT 'Apply neem oil', 'नीम का तेल लगाएं', 'ಬೇವಿನ ಎಣ್ಣೆ ಹಚ್ಚಿ', true, false, 102, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.checklist_template_items WHERE label = 'Apply neem oil' AND is_active = false
);

-- Backfill already-seeded on-demand visit checklist rows so existing services
-- (whose forced items were inserted with template_item_id = NULL) translate too.
UPDATE public.visit_checklist_items v
   SET template_item_id = t.id
  FROM public.checklist_template_items t
 WHERE t.is_active = false
   AND t.label = v.label
   AND v.label IN ('Apply fertilizer', 'Apply neem oil')
   AND v.template_item_id IS NULL;
