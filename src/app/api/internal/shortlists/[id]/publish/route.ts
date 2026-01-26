import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Create Supabase client with service role
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST /api/internal/shortlists/[id]/publish
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

    const supabase = getSupabaseAdmin();

    // Fetch shortlist
    const { data: shortlist, error: shortlistError } = await supabase
      .from("shortlists")
      .select("*")
      .eq("id", id)
      .single();

    if (shortlistError || !shortlist) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }

    // Fetch all draft items
    const { data: draftItems, error: itemsError } = await supabase
      .from("shortlist_draft_items")
      .select("*")
      .eq("shortlist_id", id);

    if (itemsError) {
      console.error("Error fetching draft items:", itemsError);
      return NextResponse.json(
        { data: null, error: "Failed to fetch draft items" },
        { status: 500 }
      );
    }

    if (!draftItems || draftItems.length === 0) {
      return NextResponse.json(
        { data: null, error: "Cannot publish shortlist with no items" },
        { status: 400 }
      );
    }

    // Calculate estimated_total: sum of (midpoint_price * quantity) for all items
    // Since we don't have actual prices, use 0 for midpoint_price per item
    // This results in estimated_total = 0
    const estimatedTotal = 0;

    // Create shortlist version
    // Calculate next version number
    const currentVersionNumber = shortlist.current_version_number || 0;
    const nextVersionNumber = currentVersionNumber + 1;

    const { data: version, error: versionError } = await supabase
      .from("shortlist_versions")
      .insert({
        shortlist_id: id,
        version_number: nextVersionNumber,
        status_at_time: "SENT_TO_CUSTOMER",
        created_by_role: "HORTICULTURIST",
        estimated_total: estimatedTotal,
      })
      .select()
      .single();

    if (versionError || !version) {
      console.error("Error creating version:", versionError);
      return NextResponse.json(
        { data: null, error: versionError?.message || "Failed to create shortlist version" },
        { status: 500 }
      );
    }

    // Copy draft items to version items
    // Required fields: shortlist_version_id, plant_id, approved, midpoint_price
    const versionItems = draftItems.map((item: any) => ({
      shortlist_version_id: version.id,
      plant_id: item.plant_id,
      quantity: item.quantity || null,
      note: item.note || null,
      why_picked_for_balcony: item.why_picked_for_balcony || null,
      horticulturist_note: null,
      approved: true,
      midpoint_price: 0, // TODO: Calculate from actual price data when available
    }));

    const { error: versionItemsError } = await supabase
      .from("shortlist_version_items")
      .insert(versionItems);

    if (versionItemsError) {
      console.error("Error creating version items:", versionItemsError);
      // Rollback: delete the version
      await supabase.from("shortlist_versions").delete().eq("id", version.id);
      return NextResponse.json(
        { data: null, error: "Failed to create version items" },
        { status: 500 }
      );
    }

    // Update shortlist status to sent to customer and increment version number
    const { error: updateError } = await supabase
      .from("shortlists")
      .update({ 
        status: "SENT_TO_CUSTOMER",
        current_version_number: nextVersionNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating shortlist status:", updateError);
      // Note: Version and items are already created, so we don't rollback
      // The shortlist status update failure is non-critical
    }

    // Get or create stable public link
    const getOrCreateActiveLink = async (shortlistId: string): Promise<string | null> => {
      // Check for existing active link
      const { data: existingLink } = await supabase
        .from("shortlist_public_links")
        .select("id, token_hash")
        .eq("shortlist_id", shortlistId)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      // Generate deterministic token (same for same shortlist_id)
      const secret = process.env.SHORTLIST_LINK_SECRET || "default-secret-change-in-production";
      const token = createHash("sha256").update(`${shortlistId}-${secret}`).digest("hex").substring(0, 32);
      const tokenHash = createHash("sha256").update(token).digest("hex");

      if (existingLink) {
        // Link exists - verify hash matches (should always match with deterministic token)
        // If hash doesn't match, it means secret changed - but we still return the URL
        // Generate URL using deterministic token
        // /s/:token is the public customer-facing shortlist route
        const host = request.headers.get("host") || "localhost:3000";
        const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`;
        return `${baseUrl}/s/${token}`;
      }

      // No link exists - create one with deterministic token
      const { data: publicLink, error: linkError } = await supabase
        .from("shortlist_public_links")
        .insert({
          shortlist_id: shortlistId,
          token_hash: tokenHash,
          active: true,
        })
        .select()
        .single();

      if (linkError) {
        console.error("Error creating public link:", linkError);
        return null;
      }

      // /s/:token is the public customer-facing shortlist route
      const host = request.headers.get("host") || "localhost:3000";
      const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`;
      return `${baseUrl}/s/${token}`;
    };

    const publicUrl = await getOrCreateActiveLink(id);

    return NextResponse.json({
      data: { success: true, version_id: version.id, version_number: nextVersionNumber, publicUrl },
      error: null,
    });
  } catch (err) {
    console.error("Error in POST /api/internal/shortlists/[id]/publish - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
