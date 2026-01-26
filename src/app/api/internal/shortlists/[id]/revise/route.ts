import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Create Supabase client with service role
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST /api/internal/shortlists/[id]/revise
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

    // Find latest version
    const versionNumber = shortlist.current_version_number || 0;
    
    if (versionNumber === 0) {
      return NextResponse.json(
        { data: null, error: "No version found to revise" },
        { status: 400 }
      );
    }

    // Fetch latest version
    const { data: latestVersion, error: versionError } = await supabase
      .from("shortlist_versions")
      .select("id")
      .eq("shortlist_id", id)
      .eq("version_number", versionNumber)
      .single();

    if (versionError || !latestVersion) {
      return NextResponse.json(
        { data: null, error: "Latest version not found" },
        { status: 404 }
      );
    }

    // Load version items from shortlist_version_items
    const { data: versionItems, error: itemsError } = await supabase
      .from("shortlist_version_items")
      .select("*")
      .eq("shortlist_version_id", latestVersion.id);

    if (itemsError) {
      console.error("Error fetching version items:", itemsError);
      return NextResponse.json(
        { data: null, error: "Failed to fetch version items" },
        { status: 500 }
      );
    }

    if (!versionItems || versionItems.length === 0) {
      return NextResponse.json(
        { data: null, error: "No items found in latest version" },
        { status: 400 }
      );
    }

    // Delete existing draft items
    const { error: deleteError } = await supabase
      .from("shortlist_draft_items")
      .delete()
      .eq("shortlist_id", id);

    if (deleteError) {
      console.error("Error deleting draft items:", deleteError);
      return NextResponse.json(
        { data: null, error: "Failed to clear draft items" },
        { status: 500 }
      );
    }

    // Insert draft items mapped from version items
    const draftItems = versionItems.map((item: any) => ({
      shortlist_id: id,
      plant_id: item.plant_id,
      quantity: item.quantity || null,
      note: item.note || null,
      why_picked_for_balcony: item.why_picked_for_balcony || null,
    }));

    const { error: insertError } = await supabase
      .from("shortlist_draft_items")
      .insert(draftItems);

    if (insertError) {
      console.error("Error inserting draft items:", insertError);
      return NextResponse.json(
        { data: null, error: "Failed to create draft items" },
        { status: 500 }
      );
    }

    // Update shortlist status to SENT_BACK_TO_CUSTOMER
    const { error: updateError } = await supabase
      .from("shortlists")
      .update({
        status: "SENT_BACK_TO_CUSTOMER",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating shortlist status:", updateError);
      return NextResponse.json(
        { data: null, error: "Failed to update shortlist status" },
        { status: 500 }
      );
    }

    // Log event
    const { error: eventError } = await supabase
      .from("events")
      .insert({
        event_name: "shortlist_revised",
        shortlist_id: id,
        version_number: versionNumber,
        actor_role: "HORTICULTURIST",
        payload: { action: "revise", from_status: shortlist.status },
      });

    if (eventError) {
      console.error("Error logging event:", eventError);
      // Non-critical - continue even if event logging fails
    }

    return NextResponse.json({
      data: { success: true },
      error: null,
    });
  } catch (err) {
    console.error("Error in POST /api/internal/shortlists/[id]/revise:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
