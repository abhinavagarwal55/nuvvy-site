import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  selections: z
    .array(
      z.object({
        catalog_product_id: z.string().uuid(),
        section_id: z.string().uuid().nullable().optional(),
      })
    )
    .default([]),
});

// POST /api/shortlists/public/[token]/accessories
// Capture (non-binding) the customer's recommended-accessory picks. Idempotent:
// replaces prior rows for the CUSTOMER_SUBMITTED version. Never touches
// plant_order_items or plant order status.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch {
      return NextResponse.json({ error: "Service temporarily unavailable. Please contact Nuvvy." }, { status: 503 });
    }

    // Resolve token → shortlist.
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data: publicLink } = await supabase
      .from("shortlist_public_links")
      .select("shortlist_id")
      .eq("token_hash", tokenHash)
      .eq("active", true)
      .maybeSingle();
    if (!publicLink) return NextResponse.json({ error: "Curated list not found" }, { status: 404 });

    // Latest CUSTOMER_SUBMITTED version (the customer must have confirmed plants first).
    const { data: version } = await supabase
      .from("shortlist_versions")
      .select("id")
      .eq("shortlist_id", publicLink.shortlist_id)
      .eq("status_at_time", "CUSTOMER_SUBMITTED")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!version) {
      return NextResponse.json({ error: "Please confirm your plants before choosing accessories." }, { status: 400 });
    }

    // Build the allowed accessory set: accessories in sections where the customer
    // selected >=1 plant (approved=true).
    const { data: versionItems } = await supabase
      .from("shortlist_version_items")
      .select("plant_id, catalog_product_id, section_id, approved")
      .eq("shortlist_version_id", version.id);

    const selectedSectionIds = new Set(
      (versionItems ?? [])
        .filter((r) => r.plant_id && r.approved && r.section_id)
        .map((r) => r.section_id as string)
    );
    // catalog_product_id → its section_id, for accessories in selected sections.
    const allowedAccessorySection: Record<string, string | null> = {};
    (versionItems ?? [])
      .filter((r) => r.catalog_product_id && r.section_id && selectedSectionIds.has(r.section_id))
      .forEach((r) => {
        allowedAccessorySection[r.catalog_product_id as string] = r.section_id as string;
      });

    // Validate + dedupe submitted selections against the allowed set.
    const seen = new Set<string>();
    const rows = parsed.data.selections
      .filter((s) => {
        if (!(s.catalog_product_id in allowedAccessorySection)) return false;
        if (seen.has(s.catalog_product_id)) return false;
        seen.add(s.catalog_product_id);
        return true;
      })
      .map((s) => ({
        shortlist_version_id: version.id,
        catalog_product_id: s.catalog_product_id,
        section_id: allowedAccessorySection[s.catalog_product_id],
      }));

    // Idempotent replace.
    await supabase.from("shortlist_accessory_selections").delete().eq("shortlist_version_id", version.id);
    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("shortlist_accessory_selections").insert(rows);
      if (insertError) {
        return NextResponse.json({ error: insertError.message || "Failed to save selections" }, { status: 500 });
      }
    }

    logAuditEvent({
      actorId: null,
      actorRole: "customer",
      action: "curated_list.accessories_selected",
      targetTable: "shortlist_versions",
      targetId: version.id,
      metadata: { count: rows.length, catalog_product_ids: rows.map((r) => r.catalog_product_id) },
    });

    return NextResponse.json({ data: { selected: rows.map((r) => r.catalog_product_id) } });
  } catch (err) {
    console.error("Error in POST /api/shortlists/public/[token]/accessories:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
