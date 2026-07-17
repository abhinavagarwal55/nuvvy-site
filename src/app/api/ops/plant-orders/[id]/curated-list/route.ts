import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  createShortlistWithItems,
  getExistingPublicUrl,
  updateShortlistMeta,
  ensureDefaultSection,
} from "@/lib/services/shortlists";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = any;

/**
 * Load the order-linked curated list: the shortlist row, its derived status,
 * its draft items (with plant info), the public URL (if published), and the
 * confirmation stamp. Shared by GET and by the send route's response.
 */
async function loadCuratedList(supabase: Supabase, shortlistId: string) {
  const { data: shortlist } = await supabase
    .from("shortlists")
    .select("id, title, description, status, current_version_number, plant_order_id, updated_at")
    .eq("id", shortlistId)
    .maybeSingle();
  if (!shortlist) return null;

  // Derive status: a CUSTOMER_SUBMITTED latest version means the customer
  // confirmed even if shortlist.status lags (mirrors the internal GET).
  const { data: latestVersion } = await supabase
    .from("shortlist_versions")
    .select("status_at_time")
    .eq("shortlist_id", shortlistId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  let derivedStatus = shortlist.status;
  if (latestVersion?.status_at_time === "CUSTOMER_SUBMITTED") {
    derivedStatus = "CUSTOMER_SUBMITTED";
  }

  let { data: sectionRows } = await supabase
    .from("shortlist_draft_sections")
    .select("id, name, sort_order")
    .eq("shortlist_id", shortlistId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // Self-heal: a curated list must always have >=1 section (a pre-migration
  // empty list may have none). Create a default one and re-read.
  if (!sectionRows || sectionRows.length === 0) {
    await ensureDefaultSection(supabase, shortlistId);
    ({ data: sectionRows } = await supabase
      .from("shortlist_draft_sections")
      .select("id, name, sort_order")
      .eq("shortlist_id", shortlistId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }));
  }

  const { data: items } = await supabase
    .from("shortlist_draft_items")
    .select(
      `id, plant_id, catalog_product_id, section_id, quantity, note, why_picked_for_balcony, created_at,
       plant:plants ( id, name, scientific_name, price_band, thumbnail_url, thumbnail_storage_url )`
    )
    .eq("shortlist_id", shortlistId)
    .order("created_at", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (items ?? []).map((i: any) => ({
    id: i.id,
    plant_id: i.plant_id,
    catalog_product_id: i.catalog_product_id,
    section_id: i.section_id,
    type: i.catalog_product_id ? "accessory" : "plant",
    quantity: i.quantity,
    note: i.note,
    why_picked_for_balcony: i.why_picked_for_balcony,
    plant: i.plant,
  }));

  // Group PLANT items under their section (accessories stay in the flat list).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections = (sectionRows ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    sort_order: s.sort_order,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: mapped.filter((m: any) => m.type === "plant" && m.section_id === s.id),
  }));

  return {
    id: shortlist.id,
    title: shortlist.title,
    description: shortlist.description,
    status: derivedStatus,
    current_version_number: shortlist.current_version_number || 0,
    updated_at: shortlist.updated_at,
    sections,
    items: mapped,
  };
}

// ---------------------------------------------------------------------------
// GET — current curated list for an order (null if none exists yet).
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }
  void auth;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: order, error } = await supabase
    .from("plant_orders")
    .select(
      "id, status, curated_shortlist_id, shortlist_version_id, curated_list_confirmed_at, curated_list_confirmed_via, customers(id, name, address)"
    )
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer = (order.customers as any) ?? null;

  if (!order.curated_shortlist_id) {
    return NextResponse.json({ data: null, customer });
  }

  const list = await loadCuratedList(supabase, order.curated_shortlist_id);
  if (!list) {
    // Dangling reference — treat as no list rather than 500.
    return NextResponse.json({ data: null });
  }

  const publicUrl = await getExistingPublicUrl(supabase, order.curated_shortlist_id, request);

  // Warning: the customer confirmed but the order was NOT in 'finalizing' at the
  // time, so nothing was materialized / advanced. We stamp confirmed_at but
  // leave shortlist_version_id null in that branch.
  const confirmationWarning =
    !!order.curated_list_confirmed_at && !order.shortlist_version_id;

  return NextResponse.json({
    data: {
      order_status: order.status,
      shortlist_version_id: order.shortlist_version_id,
      curated_list_confirmed_at: order.curated_list_confirmed_at,
      curated_list_confirmed_via: order.curated_list_confirmed_via,
      confirmation_warning: confirmationWarning,
      public_url: publicUrl,
      customer,
      list,
    },
  });
}

// ---------------------------------------------------------------------------
// POST — create the curated list bound to this order (one per order).
// Customer is inherited from plant_orders.customer_id (read-only) and only
// needs to EXIST (the ACTIVE-customer rule is relaxed for order-originated
// lists — LOCKED DESIGN DECISIONS).
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("plant_orders")
    .select("id, status, customer_id, curated_shortlist_id, customers(name)")
    .eq("id", id)
    .single();

  if (orderError) {
    if (orderError.code === "PGRST116") return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  // One active curated list per order in V1.
  if (order.curated_shortlist_id) {
    return NextResponse.json(
      { error: "A curated list already exists for this order." },
      { status: 409 }
    );
  }

  // Only meaningful in the early pipeline; sending would advance interested → finalizing.
  if (!["interested", "finalizing"].includes(order.status)) {
    return NextResponse.json(
      { error: "A curated list can only be created while the order is in 'interested' or 'finalizing'." },
      { status: 422 }
    );
  }

  if (!order.customer_id) {
    return NextResponse.json({ error: "This order has no customer to inherit." }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customerName = (order.customers as any)?.name ?? "customer";
  const created = await createShortlistWithItems(supabase, {
    customerId: order.customer_id,
    title: `Curated plants for ${customerName}`,
    description: null,
    items: [],
    requireActiveCustomer: false,
    plantOrderId: id,
  });

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  const { error: linkError } = await supabase
    .from("plant_orders")
    .update({ curated_shortlist_id: created.data.id })
    .eq("id", id);

  if (linkError) {
    // Roll back the shortlist so we don't leave an orphan the order can't reach.
    await supabase.from("shortlists").delete().eq("id", created.data.id);
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order.curated_list_created",
    targetTable: "plant_orders",
    targetId: id,
    metadata: { shortlist_id: created.data.id },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  const list = await loadCuratedList(supabase, created.data.id);
  return NextResponse.json({ data: { list } }, { status: 201 });
}

// ---------------------------------------------------------------------------
// PATCH — rename the curated list / edit its description. Editable only while
// the order is still in the early pipeline (list not yet confirmed/locked).
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { title, description } = body as { title?: string; description?: string | null };

  const supabase = getSupabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("plant_orders")
    .select("id, status, curated_shortlist_id")
    .eq("id", id)
    .single();
  if (orderError) {
    if (orderError.code === "PGRST116") return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }
  if (!order.curated_shortlist_id) {
    return NextResponse.json({ error: "No curated list exists for this order." }, { status: 400 });
  }
  if (!["interested", "finalizing"].includes(order.status)) {
    return NextResponse.json(
      { error: "The curated list is locked once the order leaves 'interested' / 'finalizing'." },
      { status: 422 }
    );
  }

  const result = await updateShortlistMeta(supabase, order.curated_shortlist_id, { title, description });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ data: { success: true } });
}
