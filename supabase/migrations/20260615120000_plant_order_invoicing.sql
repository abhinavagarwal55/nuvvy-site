-- Plant Order Invoicing (Billing module) — additive evolution of the existing
-- invoice scaffold. See nuvvy-plant-order-invoicing-prd.md §3.
--
-- All changes are additive. No data is dropped; existing invoice rows (if any)
-- keep working. Care-plan billing (bills/subscriptions) is untouched.

BEGIN;

-- ─── 3.1 invoices — 3 new columns + one-active-invoice-per-order index ────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_date     date,         -- editable "Date" on the PDF; drives month grouping
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz,  -- last time the WA message was sent
  ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz;  -- last PDF download (audit/info only)

-- One non-cancelled invoice per plant order.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_per_order
  ON public.invoices (plant_order_id)
  WHERE status <> 'cancelled' AND plant_order_id IS NOT NULL;

-- ─── 3.2 invoice_items — section + nullable qty/price ─────────────────────────
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'plants'
    CHECK (section IN ('service','plants'));

ALTER TABLE public.invoice_items
  ALTER COLUMN quantity   DROP NOT NULL,   -- service lines have no quantity (PDF shows "-")
  ALTER COLUMN unit_price DROP NOT NULL;   -- blank until Harshita fills it

-- ─── 3.3 system_config — WA template + default Section-A service lines ────────
-- Stored as plain text (system_config.value is text). The default service lines
-- key holds a JSON array string. ON CONFLICT DO NOTHING so re-runs never clobber
-- admin-edited values.
INSERT INTO public.system_config (key, value) VALUES
  (
    'plant_invoice_whatsapp_template_v1',
    $tmpl$Hi {customer_name}, thank you for ordering from Nuvvy! 🌿
Please find your plant order invoice ({invoice_number}) attached.
Total: ₹{total}
Kindly share a screenshot once payment is done. UPI - {upi_id}$tmpl$
  ),
  (
    'plant_invoice_default_service_lines_v1',
    $lines$["Consultation & Plants/Pots selection","Installation & Planting charges","Transportation and Input Materials Cost (Garden Soil, Vermi-Compost, Cocopeat, Perlite, Neem Powder)"]$lines$
  )
ON CONFLICT (key) DO NOTHING;

COMMIT;
