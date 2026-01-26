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

// DELETE /api/internal/shortlists/[id]/items/[itemId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;

    if (!id) {
      return NextResponse.json(
        { data: null, error: "Shortlist ID is required" },
        { status: 400 }
      );
    }

    if (!itemId) {
      return NextResponse.json(
        { data: null, error: "Item ID is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Verify shortlist exists
    const { data: shortlist, error: shortlistError } = await supabase
      .from("shortlists")
      .select("id")
      .eq("id", id)
      .single();

    if (shortlistError || !shortlist) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }

    // Delete item
    const { error: deleteError } = await supabase
      .from("shortlist_draft_items")
      .delete()
      .eq("id", itemId)
      .eq("shortlist_id", id);

    if (deleteError) {
      console.error("Error deleting item - full Supabase error:", deleteError);
      return NextResponse.json(
        {
          data: null,
          error: deleteError.message || deleteError.details || "Failed to remove plant from shortlist",
        },
        { status: 500 }
      );
    }

    // Update shortlist timestamp
    await supabase
      .from("shortlists")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({
      data: { success: true },
      error: null,
    });
  } catch (err) {
    console.error("Error in DELETE /api/internal/shortlists/[id]/items/[itemId] - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
