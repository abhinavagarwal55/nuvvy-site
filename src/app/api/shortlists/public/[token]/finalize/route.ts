import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

    // Parse request body
    const body = await request.json();
    const { items } = body;

    // Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Items array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate quantities
    for (const item of items) {
      if (!item.plant_id) {
        return NextResponse.json(
          { error: "Each item must have a plant_id" },
          { status: 400 }
        );
      }
      if (item.quantity !== undefined && item.quantity < 1) {
        return NextResponse.json(
          { error: "Quantity must be >= 1" },
          { status: 400 }
        );
      }
    }

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

    // Step 4: Insert shortlist_version_items
    // Insert ONLY the items sent in the request - these are the customer's changes
    // Each row references the NEW version_id (never reuse previous rows)
    const versionItems = items.map((item: any) => ({
      shortlist_version_id: newVersion.id,
      plant_id: item.plant_id,
      quantity: item.quantity || null,
      note: item.notes || null,
      why_picked_for_balcony: null, // Customer submissions don't include this
      horticulturist_note: null,
      approved: true, // Customer-submitted items are considered approved
      midpoint_price: 0, // Placeholder - would need to fetch from plants table in production
    }));

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

    // Step 6: Return success response
    return NextResponse.json({
      version: nextVersionNumber,
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
