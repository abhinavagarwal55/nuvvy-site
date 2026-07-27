-- On-Demand Service — reuse the HUMAN-curated fertilizer / neem translations.
--
-- The forced on-demand checklist items must show the same hi/kn strings ops
-- maintains under Settings → Care Action Names (care_action_types), not ad-hoc
-- ones. Pull label + label_hi + label_kn straight from care_action_types so the
-- checklist matches the care guide. English label is aligned to the care-action
-- display_name ('Apply Fertilizer' / 'Apply Neem Oil').

UPDATE public.checklist_template_items c
   SET label     = cat.display_name,
       label_hi  = cat.display_name_hi,
       label_kn  = cat.display_name_kn,
       needs_translation_review = false
  FROM public.care_action_types cat
 WHERE cat.name = 'fertilizer'
   AND c.is_active = false
   AND c.label IN ('Apply fertilizer', 'Apply Fertilizer');

UPDATE public.checklist_template_items c
   SET label     = cat.display_name,
       label_hi  = cat.display_name_hi,
       label_kn  = cat.display_name_kn,
       needs_translation_review = false
  FROM public.care_action_types cat
 WHERE cat.name = 'neem_oil'
   AND c.is_active = false
   AND c.label IN ('Apply neem oil', 'Apply Neem Oil');

-- Re-sync the English snapshot label on already-seeded on-demand visit rows to
-- the (now care-action-aligned) template label, via the existing template link.
UPDATE public.visit_checklist_items v
   SET label = t.label
  FROM public.checklist_template_items t
 WHERE v.template_item_id = t.id
   AND t.is_active = false
   AND t.label IN ('Apply Fertilizer', 'Apply Neem Oil');
