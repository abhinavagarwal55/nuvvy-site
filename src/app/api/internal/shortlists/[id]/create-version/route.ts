import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/internal/shortlists/[id]/create-version
// Creates a new DRAFT version from a CUSTOMER_SUBMITTED version
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

    // Verify shortlist exists
    const { data: shortlist, error: shortlistError } = await supabase
      .from("shortlists")
      .select("id, current_version_number, status")
      .eq("id", id)
      .single();

    if (shortlistError || !shortlist) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }

    // Get latest CUSTOMER_SUBMITTED version
    const { data: submittedVersion, error: versionError } = await supabase
      .from("shortlist_versions")
      .select("id, version_number")
      .eq("shortlist_id", id)
      .eq("status_at_time", "CUSTOMER_SUBMITTED")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versionError || !submittedVersion) {
      return NextResponse.json(
        { data: null, error: "No customer-submitted version found" },
        { status: 404 }
      );
    }

    // Fetch version items from the submitted version
    const { data: versionItems, error: itemsError } = await supabase
      .from("shortlist_version_items")
      .select("plant_id, quantity, note, why_picked_for_balcony")
      .eq("shortlist_version_id", submittedVersion.id);

    if (itemsError || !versionItems || versionItems.length === 0) {
      return NextResponse.json(
        { data: null, error: "Failed to fetch submitted version items" },
        { status: 500 }
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

    // Create new draft items from submitted version
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
      console.error("Error creating draft items:", insertError);
      return NextResponse.json(
        { data: null, error: "Failed to create draft from submitted version" },
        { status: 500 }
      );
    }

    // Update shortlist: increment current_version_number and set status to DRAFT
    const currentVersion = shortlist.current_version_number || 0;
    const nextVersion = currentVersion + 1;

    const { error: updateError } = await supabase
      .from("shortlists")
      .update({
        status: "DRAFT",
        current_version_number: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating shortlist:", updateError);
      return NextResponse.json(
        { data: null, error: "Failed to update shortlist" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        success: true,
        new_version_number: nextVersion,
      },
      error: null,
    });
  } catch (err) {
    console.error("Error in POST /api/internal/shortlists/[id]/create-version:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
