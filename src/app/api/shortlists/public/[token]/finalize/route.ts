import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { couplePlantOrderOnCuratedConfirm } from "@/lib/services/shortlists";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// WS-B: each item references either a plant OR a catalog product (never both)
const itemSchema = z
  .object({
    plant_id: z.string().uuid().optional(),
    catalog_product_id: z.string().uuid().optional(),
    quantity: z.number().int().min(1).nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (v) => Boolean(v.plant_id) !== Boolean(v.catalog_product_id),
    {
      message:
        "Each item must reference exactly one of plant_id or catalog_product_id",
    }
  );

const finalizeSchema = z.object({
  items: z.array(itemSchema).min(1),
});

// POST /api/shortlists/public/[token]/finalize
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Parse + validate request body
    const body = await request.json().catch(() => null);
    const parsed = finalizeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const items = parsed.data.items;

    // Create Supabase admin client with proper error handling
    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (err) {
      console.error("Failed to initialize Supabase client:", err);
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please contact Nuvvy." },
        { status: 503 }
      );
    }

    // Step 1: Validate token - hash the token and find matching public link
    // Tokens are stored as SHA-256 hashes in the database
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { data: publicLink, error: linkError } = await supabase
      .from("shortlist_public_links")
      .select("shortlist_id")
      .eq("token_hash", tokenHash)
      .eq("active", true)
      .maybeSingle();

    if (linkError) {
      console.error("Error fetching public link:", linkError);
      return NextResponse.json(
        { error: "Failed to validate token" },
        { status: 500 }
      );
    }

    if (!publicLink) {
      return NextResponse.json(
        { error: "Shortlist not found" },
        { status: 404 }
      );
    }

    const shortlistId = publicLink.shortlist_id;

    // Step 2: Find latest SENT_TO_CUSTOMER version for this shortlist
    // This is the BASE version the customer is responding to
    const { data: latestVersion, error: versionError } = await supabase
      .from("shortlist_versions")
      .select("id, version_number")
      .eq("shortlist_id", shortlistId)
      .eq("status_at_time", "SENT_TO_CUSTOMER")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versionError) {
      console.error("Error fetching latest version:", versionError);
      return NextResponse.json(
        { error: "Failed to find base version" },
        { status: 500 }
      );
    }

    if (!latestVersion) {
      return NextResponse.json(
        { error: "No sent version found. Cannot finalize." },
        { status: 400 }
      );
    }

    // Step 3: Create a NEW shortlist_version row
    // This is immutable - we never modify existing versions
    const nextVersionNumber = latestVersion.version_number + 1;

    // Calculate estimated_total (placeholder for now, as we don't have price data in items)
    // In a real implementation, this would sum up midpoint_price * quantity from version items
    const estimatedTotal = 0;

    const { data: newVersion, error: insertVersionError } = await supabase
      .from("shortlist_versions")
      .insert({
        shortlist_id: shortlistId,
        version_number: nextVersionNumber,
        status_at_time: "CUSTOMER_SUBMITTED",
        created_by_role: "CUSTOMER",
        estimated_total: estimatedTotal,
        customer_notes: null, // Can be extended later if needed
      })
      .select()
      .single();

    if (insertVersionError || !newVersion) {
      console.error("Error creating version:", insertVersionError);
      return NextResponse.json(
        { error: insertVersionError?.message || "Failed to create version" },
        { status: 500 }
      );
    }

    // Step 4: Insert shortlist_version_items — polymorphic (WS-B).
    // Plant items come from the customer's submission body.
    // Accessory items are carried forward from the source SENT version
    // unchanged — the customer doesn't choose them via qty; they're
    // pure curation + Buy-on-Amazon. Preserving them keeps the version
    // snapshot honest about what the customer saw.
    const plantVersionItems = items
      .filter((item) => item.plant_id)
      .map((item) => {
        const quantity =
          item.quantity != null && item.quantity > 0 ? item.quantity : null;
        return {
          shortlist_version_id: newVersion.id,
          plant_id: item.plant_id ?? null,
          catalog_product_id: null,
          quantity,
          note: item.notes || null,
          why_picked_for_balcony: null,
          horticulturist_note: null,
          approved: quantity !== null,
          midpoint_price: 0,
        };
      });

    // Fetch accessory rows from the source SENT version and clone them
    const { data: sourceAccessories } = await supabase
      .from("shortlist_version_items")
      .select("catalog_product_id, quantity, note, why_picked_for_balcony, horticulturist_note, approved, midpoint_price")
      .eq("shortlist_version_id", latestVersion.id)
      .not("catalog_product_id", "is", null);

    const accessoryVersionItems = (sourceAccessories ?? []).map((row) => ({
      shortlist_version_id: newVersion.id,
      plant_id: null,
      catalog_product_id: row.catalog_product_id,
      quantity: row.quantity,
      note: row.note,
      why_picked_for_balcony: row.why_picked_for_balcony,
      horticulturist_note: row.horticulturist_note,
      approved: row.approved ?? false,
      midpoint_price: row.midpoint_price ?? 0,
    }));

    const versionItems = [...plantVersionItems, ...accessoryVersionItems];

    const { error: itemsError } = await supabase
      .from("shortlist_version_items")
      .insert(versionItems);

    if (itemsError) {
      console.error("Error creating version items:", itemsError);
      // Rollback: delete the version we just created
      await supabase.from("shortlist_versions").delete().eq("id", newVersion.id);
      return NextResponse.json(
        { error: itemsError.message || "Failed to create version items" },
        { status: 500 }
      );
    }

    // Step 5: Update parent shortlist status and metadata
    // This syncs the internal dashboard to reflect customer submission
    const { error: updateShortlistError } = await supabase
      .from("shortlists")
      .update({
        status: "CUSTOMER_SUBMITTED",
        current_version_number: nextVersionNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shortlistId);

    if (updateShortlistError) {
      console.error("Error updating parent shortlist:", updateShortlistError);
      // Rollback: delete the version and its items
      await supabase.from("shortlist_version_items").delete().eq("shortlist_version_id", newVersion.id);
      await supabase.from("shortlist_versions").delete().eq("id", newVersion.id);
      return NextResponse.json(
        { error: updateShortlistError.message || "Failed to update shortlist status" },
        { status: 500 }
      );
    }

    // Step 6: If this shortlist is bound to a plant order (curated list), run
    // the order-coupling routine: guarded status advance, confirmation stamp,
    // PLANT-item materialization, audit. No-op for legacy CMS shortlists.
    // Wrapped so a coupling failure never breaks the customer's submission.
    let orderCoupling: Awaited<ReturnType<typeof couplePlantOrderOnCuratedConfirm>> | null = null;
    try {
      orderCoupling = await couplePlantOrderOnCuratedConfirm(supabase, {
        shortlistId,
        versionId: newVersion.id,
      });
    } catch (couplingErr) {
      console.error("Curated-list order coupling failed (non-fatal):", couplingErr);
    }

    // Step 7: Return success response
    return NextResponse.json({
      version: nextVersionNumber,
      order_coupling: orderCoupling,
    });
  } catch (err) {
    console.error("Error in POST /api/shortlists/public/[token]/finalize:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
