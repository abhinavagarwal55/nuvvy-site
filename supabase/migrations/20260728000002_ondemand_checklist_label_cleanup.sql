-- On-Demand Service — drop the "(on-demand)" suffix from the forced fertilizer
-- + neem checklist items. The suffix confused gardeners; the items are plain
-- "Apply fertilizer" / "Apply neem oil". Idempotent; only touches already-seeded
-- on-demand visit checklists.
UPDATE public.visit_checklist_items
   SET label = 'Apply fertilizer'
 WHERE label = 'Apply fertilizer (on-demand)';

UPDATE public.visit_checklist_items
   SET label = 'Apply neem oil'
 WHERE label = 'Apply neem oil (on-demand)';
