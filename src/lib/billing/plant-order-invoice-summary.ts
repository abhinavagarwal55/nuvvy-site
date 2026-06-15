import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMonthLabel, monthBounds } from "@/lib/billing/template";

/**
 * Monthly Plant Orders billing summary (nuvvy-plant-order-invoicing-prd.md §4).
 *
 * A plant order is *billable* if it is at/past installation OR already has a
 * non-cancelled invoice:
 *   plant_orders.status IN ('installed','invoiced')  OR  has non-cancelled invoice
 *
 * Each billable order is bucketed into a month by its `effective_date`:
 *   - invoice exists → invoice.invoice_date
 *   - else           → plant_orders.due_date (fallback created_at::date)
 *
 * Care plans are NOT included here — they keep the simple per-month bill amount
 * on the Billing → Care Plans tab.
 */

export type PlantOrderInvoiceStatus =
  | "draft"
  | "finalized"
  | "paid"
  | "cancelled";

export type PlantOrderBillingRow = {
  plant_order_id: string;
  order_status: string;
  customer_id: string;
  customer_name: string;
  customer_created_at: string | null;
  phone_number: string | null;
  society_name: string | null;
  address: string | null;
  items_summary: string;
  item_count: number;
  // Invoice (null when no non-cancelled invoice yet)
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: PlantOrderInvoiceStatus | null;
  invoice_total: number | null;
  invoice_date: string | null;
  paid_at: string | null;
  whatsapp_sent_at: string | null;
  effective_date: string; // YYYY-MM-DD
};

export type PlantOrderBillingSummary = {
  month: string;
  month_label: string;
  rows: PlantOrderBillingRow[];
  totals: { revenue: number; paid: number; outstanding: number };
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  plant_order_id: string;
  status: PlantOrderInvoiceStatus;
  total: number | null;
  paid_at: string | null;
  whatsapp_sent_at: string | null;
  invoice_date: string | null;
};

type OrderItemRow = { plant_name: string; quantity: number | null };

type OrderRow = {
  id: string;
  status: string;
  due_date: string | null;
  created_at: string;
  customer_id: string;
  customers: {
    id: string;
    name: string;
    phone_number: string | null;
    address: string | null;
    created_at: string | null;
    societies: { name: string } | null;
  } | null;
  plant_order_items: OrderItemRow[] | null;
};

/** "Bird of Paradise ×8, Areca Palm ×2 +2 more" */
function summariseItems(items: OrderItemRow[]): string {
  if (items.length === 0) return "No plants on order";
  const shown = items
    .slice(0, 3)
    .map((i) => `${i.plant_name} ×${i.quantity ?? 1}`)
    .join(", ");
  const extra = items.length - 3;
  return extra > 0 ? `${shown} +${extra} more` : shown;
}

export async function getMonthlyPlantOrderInvoiceSummary(
  supabase: SupabaseClient,
  month: string
): Promise<PlantOrderBillingSummary> {
  const bounds = monthBounds(month);

  // 1. All non-cancelled invoices tied to a plant order, keyed by order id.
  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, plant_order_id, status, total, paid_at, whatsapp_sent_at, invoice_date"
    )
    .neq("status", "cancelled")
    .not("plant_order_id", "is", null);

  if (invErr) throw new Error(invErr.message);

  const invoiceByOrder = new Map<string, InvoiceRow>();
  for (const inv of (invoices ?? []) as InvoiceRow[]) {
    invoiceByOrder.set(inv.plant_order_id, inv);
  }

  // 2. Orders that are billable by status.
  const { data: statusOrders, error: soErr } = await supabase
    .from("plant_orders")
    .select("id")
    .in("status", ["installed", "invoiced"]);

  if (soErr) throw new Error(soErr.message);

  // 3. Union of billable order ids = status-billable ∪ has-invoice.
  const orderIds = new Set<string>();
  for (const o of statusOrders ?? []) orderIds.add(o.id as string);
  for (const oid of invoiceByOrder.keys()) orderIds.add(oid);

  if (orderIds.size === 0) {
    return {
      month,
      month_label: formatMonthLabel(month),
      rows: [],
      totals: { revenue: 0, paid: 0, outstanding: 0 },
    };
  }

  // 4. Fetch the full order rows with customer + items.
  const { data: orders, error: ordErr } = await supabase
    .from("plant_orders")
    .select(
      `
        id, status, due_date, created_at, customer_id,
        customers ( id, name, phone_number, address, created_at, societies(name) ),
        plant_order_items ( plant_name, quantity )
      `
    )
    .in("id", Array.from(orderIds));

  if (ordErr) throw new Error(ordErr.message);

  const rows: PlantOrderBillingRow[] = [];

  for (const order of (orders ?? []) as unknown as OrderRow[]) {
    const invoice = invoiceByOrder.get(order.id) ?? null;
    const effectiveDate =
      invoice?.invoice_date ??
      order.due_date ??
      order.created_at.slice(0, 10);

    // Month filter on effective_date.
    if (effectiveDate < bounds.start || effectiveDate > bounds.end) continue;

    const items = order.plant_order_items ?? [];
    const customer = order.customers;

    rows.push({
      plant_order_id: order.id,
      order_status: order.status,
      customer_id: order.customer_id,
      customer_name: customer?.name ?? "Unknown",
      customer_created_at: customer?.created_at ?? null,
      phone_number: customer?.phone_number ?? null,
      society_name: customer?.societies?.name ?? null,
      address: customer?.address ?? null,
      items_summary: summariseItems(items),
      item_count: items.length,
      invoice_id: invoice?.id ?? null,
      invoice_number: invoice?.invoice_number ?? null,
      invoice_status: invoice?.status ?? null,
      invoice_total: invoice?.total != null ? Number(invoice.total) : null,
      invoice_date: invoice?.invoice_date ?? null,
      paid_at: invoice?.paid_at ?? null,
      whatsapp_sent_at: invoice?.whatsapp_sent_at ?? null,
      effective_date: effectiveDate,
    });
  }

  rows.sort((a, b) => a.customer_name.localeCompare(b.customer_name));

  // Totals: revenue = finalized|paid invoice totals; paid = paid invoice totals.
  let revenue = 0;
  let paid = 0;
  for (const r of rows) {
    if (r.invoice_status === "finalized" || r.invoice_status === "paid") {
      revenue += r.invoice_total ?? 0;
    }
    if (r.invoice_status === "paid") {
      paid += r.invoice_total ?? 0;
    }
  }

  return {
    month,
    month_label: formatMonthLabel(month),
    rows,
    totals: { revenue, paid, outstanding: revenue - paid },
  };
}
