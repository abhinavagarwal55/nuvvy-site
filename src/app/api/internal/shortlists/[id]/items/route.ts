import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { logAuditEvent } from "@/lib/services/audit";
import { addPlantDraftItem } from "@/lib/services/shortlists";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Create Supabase client with service role
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

const itemSchema = z
  .object({
    plant_id: z.string().uuid().optional(),
    catalog_product_id: z.string().uuid().optional(),
  })
  .refine(
    (v) => Boolean(v.plant_id) !== Boolean(v.catalog_product_id),
    {
      message: "Exactly one of plant_id or catalog_product_id is required",
    }
  );

// POST /api/internal/shortlists/[id]/items
// Accepts EITHER { plant_id } OR { catalog_product_id }.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { data: null, error: "Shortlist ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = itemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { plant_id, catalog_product_id } = parsed.data;

    const supabase = getSupabaseAdmin();

    // Verify shortlist exists
    const { data: shortlist, error: shortlistError } = await supabase
      .from("shortlists")
      .select("id, status")
      .eq("id", id)
      .single();
    if (shortlistError || !shortlist) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }

    if (catalog_product_id) {
      // Re-validate accessory is active (search endpoint also filters but
      // status can change between modal open and click).
      const { data: prod } = await supabase
        .from("catalog_products")
        .select("id, status")
        .eq("id", catalog_product_id)
        .maybeSingle();
      if (!prod || prod.status !== "active") {
        return NextResponse.json(
          { data: null, error: "This accessory is no longer in the catalog." },
          { status: 400 }
        );
      }

      // Duplicate check (shortlist_id, catalog_product_id)
      const { data: existing } = await supabase
        .from("shortlist_draft_items")
        .select("id")
        .eq("shortlist_id", id)
        .eq("catalog_product_id", catalog_product_id)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { data: existing, error: null },
          { status: 200 }
        );
      }

      const { data: item, error: insertError } = await supabase
        .from("shortlist_draft_items")
        .insert({
          shortlist_id: id,
          plant_id: null,
          catalog_product_id,
        })
        .select()
        .single();
      if (insertError) {
        console.error("Error creating accessory item:", insertError);
        return NextResponse.json(
          { data: null, error: insertError.message || "Failed to add accessory" },
          { status: 500 }
        );
      }

      await supabase
        .from("shortlists")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);

      logAuditEvent({
        actorId: null,
        actorRole: "internal",
        action: "shortlist_item.added",
        targetTable: "shortlist_draft_items",
        targetId: item.id,
        metadata: { item_type: "accessory", catalog_product_id, shortlist_id: id },
      });

      return NextResponse.json({ data: item, error: null });
    }

    // Plant path — shared with the ops curated-list surface.
    const result = await addPlantDraftItem(supabase, id, plant_id!);
    if (!result.ok) {
      return NextResponse.json({ data: null, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data, error: null });
  } catch (err) {
    console.error("Error in POST /api/internal/shortlists/[id]/items - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
