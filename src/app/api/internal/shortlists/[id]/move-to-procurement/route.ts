import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/internal/shortlists/[id]/move-to-procurement
// Moves a CUSTOMER_SUBMITTED shortlist to TO_BE_PROCURED status
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

    // Fetch current shortlist
    const { data: shortlist, error: fetchError } = await supabase
      .from("shortlists")
      .select("id, status")
      .eq("id", id)
      .single();

    if (fetchError || !shortlist) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }

    // Check latest version to determine actual status (same logic as GET endpoint)
    const { data: latestVersion } = await supabase
      .from("shortlist_versions")
      .select("status_at_time")
      .eq("shortlist_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Derive effective status: if latest version is CUSTOMER_SUBMITTED, use that; otherwise use shortlist.status
    const effectiveStatus = latestVersion?.status_at_time === "CUSTOMER_SUBMITTED" 
      ? "CUSTOMER_SUBMITTED" 
      : shortlist.status;

    // Validate that current status is CUSTOMER_SUBMITTED
    if (effectiveStatus !== "CUSTOMER_SUBMITTED") {
      return NextResponse.json(
        { 
          data: null, 
          error: `Cannot move to procurement. Current status is "${effectiveStatus}". Only CUSTOMER_SUBMITTED shortlists can be moved to procurement.` 
        },
        { status: 400 }
      );
    }

    // Update shortlist status to TO_BE_PROCURED
    const { data: updatedShortlist, error: updateError } = await supabase
      .from("shortlists")
      .update({
        status: "TO_BE_PROCURED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedShortlist) {
      console.error("Error updating shortlist status:", updateError);
      return NextResponse.json(
        { data: null, error: updateError?.message || "Failed to move shortlist to procurement" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: updatedShortlist,
      error: null,
    });
  } catch (err) {
    console.error("Error in POST /api/internal/shortlists/[id]/move-to-procurement:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
