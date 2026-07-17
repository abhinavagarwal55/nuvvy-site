import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { ensureDefaultSection } from "@/lib/services/shortlists";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  template_id: z.string().uuid(),
  section_id: z.string().uuid().optional(),
});

// Curated-list statuses where the draft is still editable (apply allowed).
const APPLIABLE_SHORTLIST_STATUSES = ["DRAFT", "SENT_BACK_TO_CUSTOMER"];

// POST /api/ops/plant-orders/[id]/curated-list/apply-template
// Snapshot-copy an active template's items into the order's DRAFT curated list.
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
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Order + curated list must exist and be in an editable state.
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

  const shortlistId = order.curated_shortlist_id as string;
  const { data: shortlist } = await supabase
    .from("shortlists")
    .select("id, status")
    .eq("id", shortlistId)
    .maybeSingle();
  if (!shortlist) return NextResponse.json({ error: "Curated list not found." }, { status: 404 });
  if (!APPLIABLE_SHORTLIST_STATUSES.includes(shortlist.status)) {
    return NextResponse.json(
      { error: "A template can only be applied while the curated list is still a draft." },
      { status: 422 }
    );
  }

  // Template must be active + non-empty.
  const { data: template } = await supabase
    .from("curated_list_templates")
    .select("id, status")
    .eq("id", parsed.data.template_id)
    .maybeSingle();
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  if (template.status !== "active") {
    return NextResponse.json({ error: "This template is no longer active." }, { status: 422 });
  }

  const { data: templateItems } = await supabase
    .from("curated_list_template_items")
    .select("plant_id, catalog_product_id, quantity, note, why_picked_for_balcony, sort_order")
    .eq("template_id", template.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!templateItems || templateItems.length === 0) {
    return NextResponse.json({ error: "This template has no items." }, { status: 422 });
  }

  // Existing draft keys (for dedupe).
  const { data: draftItems } = await supabase
    .from("shortlist_draft_items")
    .select("plant_id, catalog_product_id")
    .eq("shortlist_id", shortlistId);
  const existingPlantIds = new Set((draftItems ?? []).map((d) => d.plant_id).filter(Boolean));
  const existingAccessoryIds = new Set((draftItems ?? []).map((d) => d.catalog_product_id).filter(Boolean));

  // Availability: which accessories are still active?
  const accessoryIds = [
    ...new Set(templateItems.filter((t) => t.catalog_product_id).map((t) => t.catalog_product_id as string)),
  ];
  const activeAccessoryIds = new Set<string>();
  if (accessoryIds.length > 0) {
    const { data: prods } = await supabase
      .from("catalog_products")
      .select("id, status")
      .in("id", accessoryIds);
    (prods ?? []).forEach((p) => {
      if (p.status === "active") activeAccessoryIds.add(p.id);
    });
  }
  // Availability: which plants still exist?
  const plantIds = [
    ...new Set(templateItems.filter((t) => t.plant_id).map((t) => t.plant_id as string)),
  ];
  const existingPlantCatalogIds = new Set<string>();
  if (plantIds.length > 0) {
    const { data: plants } = await supabase.from("plants").select("id").in("id", plantIds);
    (plants ?? []).forEach((p) => existingPlantCatalogIds.add(p.id));
  }

  // Plants land in the requested section (default: the list's first section).
  const targetSectionId = parsed.data.section_id ?? (await ensureDefaultSection(supabase, shortlistId));

  let added = 0;
  let skipped_duplicate = 0;
  let skipped_unavailable = 0;
  const rowsToInsert: Record<string, unknown>[] = [];

  for (const t of templateItems) {
    if (t.catalog_product_id) {
      if (existingAccessoryIds.has(t.catalog_product_id)) {
        skipped_duplicate++;
        continue;
      }
      if (!activeAccessoryIds.has(t.catalog_product_id)) {
        skipped_unavailable++;
        continue;
      }
      existingAccessoryIds.add(t.catalog_product_id); // dedupe within this apply
      rowsToInsert.push({
        shortlist_id: shortlistId,
        plant_id: null,
        catalog_product_id: t.catalog_product_id,
        quantity: t.quantity ?? null,
        note: t.note ?? null,
        why_picked_for_balcony: t.why_picked_for_balcony ?? null,
      });
      added++;
    } else if (t.plant_id) {
      if (existingPlantIds.has(t.plant_id)) {
        skipped_duplicate++;
        continue;
      }
      if (!existingPlantCatalogIds.has(t.plant_id)) {
        skipped_unavailable++;
        continue;
      }
      existingPlantIds.add(t.plant_id);
      rowsToInsert.push({
        shortlist_id: shortlistId,
        plant_id: t.plant_id,
        catalog_product_id: null,
        quantity: t.quantity ?? null,
        note: t.note ?? null,
        why_picked_for_balcony: t.why_picked_for_balcony ?? null,
        section_id: targetSectionId,
      });
      added++;
    }
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase.from("shortlist_draft_items").insert(rowsToInsert);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    await supabase.from("shortlists").update({ updated_at: new Date().toISOString() }).eq("id", shortlistId);
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "curated_template.applied",
    targetTable: "shortlists",
    targetId: shortlistId,
    metadata: {
      template_id: template.id,
      shortlist_id: shortlistId,
      plant_order_id: id,
      added,
      skipped_duplicate,
      skipped_unavailable,
    },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: { added, skipped_duplicate, skipped_unavailable } });
}
