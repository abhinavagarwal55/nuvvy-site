import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";

/**
 * Shared shortlist operations.
 *
 * These functions are the single source of truth for the shortlist lifecycle
 * (create → add/remove items → publish/send → revise → customer confirm). They
 * are called by BOTH the legacy /api/internal/shortlists routes AND the new
 * ops /api/ops/plant-orders/[id]/curated-list routes so the two surfaces never
 * diverge. Every function takes a service-role Supabase client so the caller
 * controls auth at the route layer.
 */

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

// ── Public link helpers (deterministic SHA-256 token, SHORTLIST_LINK_SECRET) ──

/** Canonical public base URL — strips internal subdomains/paths. */
export function getPublicBaseUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL.trim();
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    baseUrl = baseUrl.replace(/\/internal\/?$/, "");
    baseUrl = baseUrl.replace(/^https?:\/\/internal\./, (m) => m.replace("internal.", ""));
    return baseUrl;
  }
  const host = request.headers.get("host") || "localhost:3000";
  const protocol =
    request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  let cleanHost = host.replace(/^internal\./, "");
  cleanHost = cleanHost.split("/")[0];
  return `${protocol}://${cleanHost}`;
}

/** Deterministic customer-facing token for a shortlist (same input → same token). */
export function shortlistToken(shortlistId: string): string {
  const secret = process.env.SHORTLIST_LINK_SECRET || "default-secret-change-in-production";
  return createHash("sha256").update(`${shortlistId}-${secret}`).digest("hex").substring(0, 32);
}

/** Get-or-create the stable public link and return its /s/[token] URL. */
export async function getOrCreateActiveLink(
  supabase: Supabase,
  shortlistId: string,
  request: NextRequest
): Promise<string | null> {
  const { data: existingLink } = await supabase
    .from("shortlist_public_links")
    .select("id")
    .eq("shortlist_id", shortlistId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const token = shortlistToken(shortlistId);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const baseUrl = getPublicBaseUrl(request);

  if (!existingLink) {
    const { error: linkError } = await supabase
      .from("shortlist_public_links")
      .insert({ shortlist_id: shortlistId, token_hash: tokenHash, active: true });
    if (linkError) {
      console.error("Error creating public link:", linkError);
      return null;
    }
  }

  return `${baseUrl}/s/${token}`;
}

/** Return the existing public URL only if an active link already exists (no create). */
export async function getExistingPublicUrl(
  supabase: Supabase,
  shortlistId: string,
  request: NextRequest
): Promise<string | null> {
  const { data: existingLink } = await supabase
    .from("shortlist_public_links")
    .select("id")
    .eq("shortlist_id", shortlistId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!existingLink) return null;
  return `${getPublicBaseUrl(request)}/s/${shortlistToken(shortlistId)}`;
}

// ── Create ───────────────────────────────────────────────────────────────────

export type CreateShortlistInput = {
  customerId: string;
  title: string;
  description?: string | null;
  /** Draft items to seed. Each references a plant by plants.id (uuid). */
  items?: { plant_id: string }[];
  /** When true, customer must exist AND be ACTIVE (legacy CMS rule). */
  requireActiveCustomer: boolean;
  /** Set for order-originated curated lists; NULL for legacy CMS shortlists. */
  plantOrderId?: string | null;
};

/**
 * Create a DRAFT shortlist (+ optional seed items). Order-originated lists pass
 * requireActiveCustomer=false (the LOCKED "customer must exist" relaxation) and
 * a plantOrderId; legacy CMS lists pass requireActiveCustomer=true.
 */
export async function createShortlistWithItems(
  supabase: Supabase,
  input: CreateShortlistInput
): Promise<ServiceResult<{ id: string } & Record<string, unknown>>> {
  const title = input.title?.trim();
  if (!input.customerId) return { ok: false, status: 400, error: "Customer is required" };
  if (!title) return { ok: false, status: 400, error: "Title is required" };

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", input.customerId)
    .single();

  if (customerError || !customer) {
    return { ok: false, status: 404, error: "Customer not found" };
  }
  if (input.requireActiveCustomer && customer.status !== "ACTIVE") {
    return { ok: false, status: 400, error: "Shortlists can only be created for ACTIVE customers" };
  }

  const { data: shortlist, error: shortlistError } = await supabase
    .from("shortlists")
    .insert({
      customer_id: input.customerId,
      customer_uuid: input.customerId,
      title,
      description: input.description?.trim() || null,
      status: "DRAFT",
      plant_order_id: input.plantOrderId ?? null,
    })
    .select()
    .single();

  if (shortlistError || !shortlist) {
    console.error("Supabase error creating shortlist:", shortlistError);
    return { ok: false, status: 500, error: shortlistError?.message || "Failed to create shortlist" };
  }

  // Every curated list is section-based (Slice 1). Seed a default "Section 1".
  const defaultSectionId = await ensureDefaultSection(supabase, shortlist.id);

  if (input.items && input.items.length > 0) {
    const itemsToInsert = input.items.map((item) => ({
      shortlist_id: shortlist.id,
      plant_id: item.plant_id,
      section_id: defaultSectionId,
    }));
    const { error: itemsError } = await supabase.from("shortlist_draft_items").insert(itemsToInsert);
    if (itemsError) {
      await supabase.from("shortlists").delete().eq("id", shortlist.id);
      return { ok: false, status: 500, error: `Failed to create shortlist items: ${itemsError.message}` };
    }
  }

  return { ok: true, data: shortlist };
}

// ── Sections (draft-side) ─────────────────────────────────────────────────────

/** Max sub-sections per curated list (enforced at the API layer, PRD). */
export const MAX_SECTIONS = 10;

/** First draft section id (by sort_order) for a list, or null if it has none. */
export async function getFirstSectionId(
  supabase: Supabase,
  shortlistId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("shortlist_draft_sections")
    .select("id")
    .eq("shortlist_id", shortlistId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Ensure the list has at least one draft section; return the first section id. */
export async function ensureDefaultSection(
  supabase: Supabase,
  shortlistId: string
): Promise<string> {
  const existing = await getFirstSectionId(supabase, shortlistId);
  if (existing) return existing;
  const { data } = await supabase
    .from("shortlist_draft_sections")
    .insert({ shortlist_id: shortlistId, name: "Section 1", sort_order: 0 })
    .select("id")
    .single();
  if (data?.id) return data.id;
  // Extremely unlikely (insert failed) — fall back to a re-read.
  return (await getFirstSectionId(supabase, shortlistId)) ?? "";
}

/** Create a new draft section (name required). Rejects the 11th section. */
export async function createSection(
  supabase: Supabase,
  shortlistId: string,
  name: string
): Promise<ServiceResult<{ id: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, status: 400, error: "Section name is required" };

  const { data: sections } = await supabase
    .from("shortlist_draft_sections")
    .select("sort_order")
    .eq("shortlist_id", shortlistId)
    .order("sort_order", { ascending: false });
  if ((sections?.length ?? 0) >= MAX_SECTIONS) {
    return { ok: false, status: 422, error: `A curated list can have at most ${MAX_SECTIONS} sections.` };
  }
  const nextOrder = (sections?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("shortlist_draft_sections")
    .insert({ shortlist_id: shortlistId, name: trimmed, sort_order: nextOrder })
    .select("id")
    .single();
  if (error || !data) return { ok: false, status: 500, error: error?.message || "Failed to create section" };

  await supabase.from("shortlists").update({ updated_at: new Date().toISOString() }).eq("id", shortlistId);
  return { ok: true, data: { id: data.id } };
}

/** Rename and/or reorder a draft section. */
export async function updateSection(
  supabase: Supabase,
  shortlistId: string,
  sectionId: string,
  patch: { name?: string; sort_order?: number }
): Promise<ServiceResult<{ success: true }>> {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const t = patch.name.trim();
    if (!t) return { ok: false, status: 400, error: "Section name cannot be empty" };
    updateData.name = t;
  }
  if (patch.sort_order !== undefined) updateData.sort_order = patch.sort_order;

  const { error } = await supabase
    .from("shortlist_draft_sections")
    .update(updateData)
    .eq("id", sectionId)
    .eq("shortlist_id", shortlistId);
  if (error) return { ok: false, status: 500, error: error.message || "Failed to update section" };

  await supabase.from("shortlists").update({ updated_at: new Date().toISOString() }).eq("id", shortlistId);
  return { ok: true, data: { success: true } };
}

/** Delete a draft section (cascades its items). Rejects deleting the last one. */
export async function deleteSection(
  supabase: Supabase,
  shortlistId: string,
  sectionId: string
): Promise<ServiceResult<{ success: true }>> {
  const { count } = await supabase
    .from("shortlist_draft_sections")
    .select("id", { count: "exact", head: true })
    .eq("shortlist_id", shortlistId);
  if ((count ?? 0) <= 1) {
    return { ok: false, status: 422, error: "A curated list must keep at least one section." };
  }

  const { error } = await supabase
    .from("shortlist_draft_sections")
    .delete()
    .eq("id", sectionId)
    .eq("shortlist_id", shortlistId);
  if (error) return { ok: false, status: 500, error: error.message || "Failed to delete section" };

  await supabase.from("shortlists").update({ updated_at: new Date().toISOString() }).eq("id", shortlistId);
  return { ok: true, data: { success: true } };
}

// ── Draft items ───────────────────────────────────────────────────────────────

/**
 * Add a plant (by plants.id uuid) to a shortlist's draft. Idempotent on
 * (shortlist, plant) — dedupe is list-wide. When `sectionId` is omitted the
 * plant lands in the list's first section.
 */
export async function addPlantDraftItem(
  supabase: Supabase,
  shortlistId: string,
  plantUuid: string,
  sectionId?: string
): Promise<ServiceResult<Record<string, unknown>>> {
  const { data: existing } = await supabase
    .from("shortlist_draft_items")
    .select("id")
    .eq("shortlist_id", shortlistId)
    .eq("plant_id", plantUuid)
    .maybeSingle();

  if (existing) return { ok: true, data: existing };

  const targetSection = sectionId ?? (await ensureDefaultSection(supabase, shortlistId));

  const { data: item, error } = await supabase
    .from("shortlist_draft_items")
    .insert({ shortlist_id: shortlistId, plant_id: plantUuid, section_id: targetSection })
    .select()
    .single();

  if (error || !item) {
    return { ok: false, status: 500, error: error?.message || "Failed to add plant" };
  }

  await supabase.from("shortlists").update({ updated_at: new Date().toISOString() }).eq("id", shortlistId);
  return { ok: true, data: item };
}

/**
 * Add an accessory (by catalog_products.id uuid) to a section's recommended
 * accessories. Idempotent on (shortlist, catalog_product). Accessories are
 * ordinary polymorphic draft items tagged with section_id — never procured.
 */
export async function addAccessoryDraftItem(
  supabase: Supabase,
  shortlistId: string,
  catalogProductId: string,
  sectionId?: string
): Promise<ServiceResult<Record<string, unknown>>> {
  const { data: existing } = await supabase
    .from("shortlist_draft_items")
    .select("id")
    .eq("shortlist_id", shortlistId)
    .eq("catalog_product_id", catalogProductId)
    .maybeSingle();

  if (existing) return { ok: true, data: existing };

  const targetSection = sectionId ?? (await ensureDefaultSection(supabase, shortlistId));

  const { data: item, error } = await supabase
    .from("shortlist_draft_items")
    .insert({ shortlist_id: shortlistId, catalog_product_id: catalogProductId, section_id: targetSection })
    .select()
    .single();

  if (error || !item) {
    return { ok: false, status: 500, error: error?.message || "Failed to add accessory" };
  }

  await supabase.from("shortlists").update({ updated_at: new Date().toISOString() }).eq("id", shortlistId);
  return { ok: true, data: item };
}

/** Remove a draft item by id (scoped to the shortlist). */
export async function removeDraftItem(
  supabase: Supabase,
  shortlistId: string,
  itemId: string
): Promise<ServiceResult<{ success: true }>> {
  const { error } = await supabase
    .from("shortlist_draft_items")
    .delete()
    .eq("id", itemId)
    .eq("shortlist_id", shortlistId);

  if (error) return { ok: false, status: 500, error: error.message || "Failed to remove item" };

  await supabase.from("shortlists").update({ updated_at: new Date().toISOString() }).eq("id", shortlistId);
  return { ok: true, data: { success: true } };
}

/** Update a shortlist's name/description (mirrors the internal PATCH meta update). */
export async function updateShortlistMeta(
  supabase: Supabase,
  shortlistId: string,
  patch: { title?: string; description?: string | null }
): Promise<ServiceResult<{ success: true }>> {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, status: 400, error: "List name cannot be empty" };
    updateData.title = t;
  }
  if (patch.description !== undefined) updateData.description = patch.description?.trim() || null;

  const { error } = await supabase.from("shortlists").update(updateData).eq("id", shortlistId);
  if (error) return { ok: false, status: 500, error: error.message || "Failed to update list details" };
  return { ok: true, data: { success: true } };
}

/** Persist per-item quantity/note edits on the draft (mirrors the internal PUT save). */
export async function updateDraftItems(
  supabase: Supabase,
  shortlistId: string,
  items: { id: string; quantity?: number | null; note?: string | null }[]
): Promise<ServiceResult<{ success: true }>> {
  for (const item of items) {
    if (!item.id) continue;
    const updateData: Record<string, unknown> = {};
    if (item.quantity !== undefined) updateData.quantity = item.quantity;
    if (item.note !== undefined) updateData.note = item.note;
    if (Object.keys(updateData).length === 0) continue;

    const { error } = await supabase
      .from("shortlist_draft_items")
      .update(updateData)
      .eq("id", item.id)
      .eq("shortlist_id", shortlistId);
    if (error) return { ok: false, status: 500, error: error.message || "Failed to save items" };
  }

  await supabase.from("shortlists").update({ updated_at: new Date().toISOString() }).eq("id", shortlistId);
  return { ok: true, data: { success: true } };
}

// ── Revise (rehydrate draft from latest version, mark SENT_BACK_TO_CUSTOMER) ───

export async function reviseShortlist(
  supabase: Supabase,
  shortlistId: string
): Promise<ServiceResult<{ success: true }>> {
  const { data: shortlist, error: shortlistError } = await supabase
    .from("shortlists")
    .select("*")
    .eq("id", shortlistId)
    .single();
  if (shortlistError || !shortlist) return { ok: false, status: 404, error: "Shortlist not found" };

  const versionNumber = shortlist.current_version_number || 0;
  if (versionNumber === 0) return { ok: false, status: 400, error: "No version found to revise" };

  const { data: latestVersion, error: versionError } = await supabase
    .from("shortlist_versions")
    .select("id")
    .eq("shortlist_id", shortlistId)
    .eq("version_number", versionNumber)
    .single();
  if (versionError || !latestVersion) return { ok: false, status: 404, error: "Latest version not found" };

  const { data: versionItems, error: itemsError } = await supabase
    .from("shortlist_version_items")
    .select("*")
    .eq("shortlist_version_id", latestVersion.id);
  if (itemsError) return { ok: false, status: 500, error: "Failed to fetch version items" };
  if (!versionItems || versionItems.length === 0) {
    return { ok: false, status: 400, error: "No items found in latest version" };
  }

  const { data: versionSections } = await supabase
    .from("shortlist_version_sections")
    .select("id, name, sort_order")
    .eq("shortlist_version_id", latestVersion.id)
    .order("sort_order", { ascending: true });

  // Clear the draft: deleting draft sections cascades their items; the explicit
  // item delete also sweeps any section-less rows (defensive).
  await supabase.from("shortlist_draft_sections").delete().eq("shortlist_id", shortlistId);
  const { error: deleteError } = await supabase
    .from("shortlist_draft_items")
    .delete()
    .eq("shortlist_id", shortlistId);
  if (deleteError) return { ok: false, status: 500, error: "Failed to clear draft items" };

  // Rehydrate draft sections from the version snapshot, mapping version→draft ids.
  const vSectionToDraft: Record<string, string> = {};
  let fallbackSectionId: string | null = null;
  for (const vs of versionSections ?? []) {
    const { data: ds } = await supabase
      .from("shortlist_draft_sections")
      .insert({ shortlist_id: shortlistId, name: vs.name, sort_order: vs.sort_order })
      .select("id")
      .single();
    if (ds) {
      vSectionToDraft[vs.id] = ds.id;
      if (fallbackSectionId === null) fallbackSectionId = ds.id;
    }
  }
  if (fallbackSectionId === null) fallbackSectionId = await ensureDefaultSection(supabase, shortlistId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draftItems = versionItems.map((item: any) => ({
    shortlist_id: shortlistId,
    plant_id: item.plant_id ?? null,
    catalog_product_id: item.catalog_product_id ?? null,
    quantity: item.quantity || null,
    note: item.note || null,
    why_picked_for_balcony: item.why_picked_for_balcony || null,
    // Both plants and accessories keep their section; a section-less plant
    // falls back to the first section, a section-less accessory stays null.
    section_id:
      (item.section_id && vSectionToDraft[item.section_id]) ||
      (item.catalog_product_id ? null : fallbackSectionId),
  }));

  const { error: insertError } = await supabase.from("shortlist_draft_items").insert(draftItems);
  if (insertError) return { ok: false, status: 500, error: "Failed to create draft items" };

  const { error: updateError } = await supabase
    .from("shortlists")
    .update({ status: "SENT_BACK_TO_CUSTOMER", updated_at: new Date().toISOString() })
    .eq("id", shortlistId);
  if (updateError) return { ok: false, status: 500, error: "Failed to update shortlist status" };

  await supabase.from("events").insert({
    event_name: "shortlist_revised",
    shortlist_id: shortlistId,
    version_number: versionNumber,
    actor_role: "HORTICULTURIST",
    payload: { action: "revise", from_status: shortlist.status },
  });

  return { ok: true, data: { success: true } };
}

// ── Publish / send (create SENT_TO_CUSTOMER version + public link) ────────────

export type PublishResult = {
  version_id: string;
  version_number: number;
  publicUrl: string | null;
};

export async function publishShortlist(
  supabase: Supabase,
  shortlistId: string,
  request: NextRequest
): Promise<ServiceResult<PublishResult>> {
  const { data: shortlist, error: shortlistError } = await supabase
    .from("shortlists")
    .select("*")
    .eq("id", shortlistId)
    .single();
  if (shortlistError || !shortlist) return { ok: false, status: 404, error: "Shortlist not found" };

  const { data: draftItems, error: itemsError } = await supabase
    .from("shortlist_draft_items")
    .select("*")
    .eq("shortlist_id", shortlistId);
  if (itemsError) return { ok: false, status: 500, error: "Failed to fetch draft items" };
  if (!draftItems || draftItems.length === 0) {
    return { ok: false, status: 400, error: "Cannot publish shortlist with no items" };
  }

  const nextVersionNumber = (shortlist.current_version_number || 0) + 1;

  const { data: version, error: versionError } = await supabase
    .from("shortlist_versions")
    .insert({
      shortlist_id: shortlistId,
      version_number: nextVersionNumber,
      status_at_time: "SENT_TO_CUSTOMER",
      created_by_role: "HORTICULTURIST",
      estimated_total: 0,
    })
    .select()
    .single();
  if (versionError || !version) {
    return { ok: false, status: 500, error: versionError?.message || "Failed to create shortlist version" };
  }

  // Snapshot draft sections → version sections, mapping draft→version ids.
  const { data: draftSections } = await supabase
    .from("shortlist_draft_sections")
    .select("id, name, sort_order")
    .eq("shortlist_id", shortlistId)
    .order("sort_order", { ascending: true });
  const dSectionToVersion: Record<string, string> = {};
  let firstVersionSectionId: string | null = null;
  for (const ds of draftSections ?? []) {
    const { data: vs } = await supabase
      .from("shortlist_version_sections")
      .insert({ shortlist_version_id: version.id, name: ds.name, sort_order: ds.sort_order })
      .select("id")
      .single();
    if (vs) {
      dSectionToVersion[ds.id] = vs.id;
      if (firstVersionSectionId === null) firstVersionSectionId = vs.id;
    }
  }

  const versionItems = draftItems
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((item: any) => item.plant_id || item.catalog_product_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => {
      const quantity = item.quantity != null && item.quantity > 0 ? item.quantity : null;
      return {
        shortlist_version_id: version.id,
        plant_id: item.plant_id ?? null,
        catalog_product_id: item.catalog_product_id ?? null,
        quantity,
        note: item.note || null,
        why_picked_for_balcony: item.why_picked_for_balcony || null,
        horticulturist_note: null,
        approved: quantity !== null,
        midpoint_price: 0,
        // Both plants and accessories carry their snapshotted section. A plant
        // with no mapped section falls back to the first section; an accessory
        // with no section stays section-less.
        section_id:
          (item.section_id && dSectionToVersion[item.section_id]) ||
          (item.catalog_product_id ? null : firstVersionSectionId),
      };
    });

  const { error: versionItemsError } = await supabase
    .from("shortlist_version_items")
    .insert(versionItems);
  if (versionItemsError) {
    await supabase.from("shortlist_versions").delete().eq("id", version.id);
    return {
      ok: false,
      status: 500,
      error: `Failed to create version items: ${versionItemsError.message || versionItemsError.details || "Unknown error"}`,
    };
  }

  await supabase
    .from("shortlists")
    .update({
      status: "SENT_TO_CUSTOMER",
      current_version_number: nextVersionNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shortlistId);

  const publicUrl = await getOrCreateActiveLink(supabase, shortlistId, request);

  return {
    ok: true,
    data: { version_id: version.id, version_number: nextVersionNumber, publicUrl },
  };
}

// ── Customer confirmation → plant-order coupling ──────────────────────────────

/** Order statuses where a customer confirmation materializes curated items. */
const MATERIALIZE_STATES = ["finalizing", "confirmed"];

/**
 * Materialize the confirmed version's PLANT items into plant_order_items,
 * reconciling idempotently: only source='curated' rows in ('pending','deferred')
 * are replaced; source='manual' rows and already-procured/on_trip curated rows
 * are never touched. Accessories (catalog_product_id) are excluded.
 */
async function materializeCuratedItems(
  supabase: Supabase,
  orderId: string,
  versionId: string
): Promise<void> {
  const { data: vItems } = await supabase
    .from("shortlist_version_items")
    .select("id, plant_id, quantity, note")
    .eq("shortlist_version_id", versionId)
    .not("plant_id", "is", null);

  const plantUuids = [...new Set((vItems ?? []).map((v) => v.plant_id as string))];
  let plantMap: Record<string, { airtable_id: string | null; name: string }> = {};
  if (plantUuids.length > 0) {
    const { data: plants } = await supabase
      .from("plants")
      .select("id, airtable_id, name")
      .in("id", plantUuids);
    plantMap = Object.fromEntries(
      (plants ?? []).map((p) => [p.id, { airtable_id: p.airtable_id, name: p.name }])
    );
  }

  // Existing curated rows — split into kept (procured/on_trip/etc) vs removable.
  const { data: curatedRows } = await supabase
    .from("plant_order_items")
    .select("id, plant_id, status")
    .eq("plant_order_id", orderId)
    .eq("source", "curated");

  const removable = (curatedRows ?? []).filter((r) =>
    ["pending", "deferred"].includes(r.status)
  );
  const keptPlantIds = new Set(
    (curatedRows ?? [])
      .filter((r) => !["pending", "deferred"].includes(r.status))
      .map((r) => r.plant_id)
      .filter(Boolean)
  );

  if (removable.length > 0) {
    await supabase
      .from("plant_order_items")
      .delete()
      .in("id", removable.map((r) => r.id));
  }

  const rows = [];
  for (const vi of vItems ?? []) {
    const p = plantMap[vi.plant_id as string];
    const airtableId = p?.airtable_id ?? null;
    // A plant already procured/on_trip keeps its row — don't create a duplicate.
    if (airtableId && keptPlantIds.has(airtableId)) continue;
    const qty = vi.quantity != null && vi.quantity > 0 ? vi.quantity : 1;
    rows.push({
      plant_order_id: orderId,
      plant_id: airtableId,
      plant_name: p?.name ?? "Selected plant",
      quantity: qty,
      note: vi.note ?? null,
      status: "pending",
      source: "curated",
      source_shortlist_version_item_id: vi.id,
    });
  }

  if (rows.length > 0) {
    await supabase.from("plant_order_items").insert(rows);
  }
}

/**
 * Run the order-coupling routine after a customer confirms an order-linked
 * curated list (CUSTOMER_SUBMITTED). No-op for legacy shortlists (no
 * plant_order_id). See LOCKED DESIGN DECISIONS.
 */
export async function couplePlantOrderOnCuratedConfirm(
  supabase: Supabase,
  args: { shortlistId: string; versionId: string }
): Promise<{ coupled: boolean; advanced?: boolean; warning?: boolean }> {
  const { data: sl } = await supabase
    .from("shortlists")
    .select("id, plant_order_id")
    .eq("id", args.shortlistId)
    .maybeSingle();
  if (!sl?.plant_order_id) return { coupled: false };

  const orderId = sl.plant_order_id as string;
  const { data: order } = await supabase
    .from("plant_orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { coupled: false };

  const nowIso = new Date().toISOString();

  // Closed / advanced-past-confirmed order: record metadata + warn, never mutate
  // status or items.
  if (!MATERIALIZE_STATES.includes(order.status)) {
    await supabase
      .from("plant_orders")
      .update({ curated_list_confirmed_at: nowIso, curated_list_confirmed_via: "customer_link" })
      .eq("id", orderId);
    logAuditEvent({
      actorId: null,
      actorRole: "customer",
      action: "plant_order.curated_list_confirmed",
      targetTable: "plant_orders",
      targetId: orderId,
      metadata: {
        advanced: false,
        warning: "order_not_in_finalizing",
        order_status: order.status,
        shortlist_id: args.shortlistId,
        version_id: args.versionId,
      },
    });
    return { coupled: true, advanced: false, warning: true };
  }

  // Happy path (finalizing) + re-confirmation (already confirmed): materialize.
  await materializeCuratedItems(supabase, orderId, args.versionId);

  const advanced = order.status === "finalizing";
  const fields: Record<string, unknown> = {
    shortlist_version_id: args.versionId,
    curated_list_confirmed_at: nowIso,
    curated_list_confirmed_via: "customer_link",
  };
  if (advanced) fields.status = "confirmed";

  await supabase.from("plant_orders").update(fields).eq("id", orderId);

  logAuditEvent({
    actorId: null,
    actorRole: "customer",
    action: "plant_order.curated_list_confirmed",
    targetTable: "plant_orders",
    targetId: orderId,
    metadata: {
      advanced,
      from: order.status,
      to: advanced ? "confirmed" : order.status,
      shortlist_id: args.shortlistId,
      version_id: args.versionId,
    },
  });

  return { coupled: true, advanced };
}
