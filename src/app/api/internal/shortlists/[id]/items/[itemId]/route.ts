import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { removeDraftItem } from "@/lib/services/shortlists";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// DELETE /api/internal/shortlists/[id]/items/[itemId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;

    if (!id) {
      return NextResponse.json({ data: null, error: "Shortlist ID is required" }, { status: 400 });
    }
    if (!itemId) {
      return NextResponse.json({ data: null, error: "Item ID is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Verify shortlist exists (preserves the legacy 404 behavior)
    const { data: shortlist, error: shortlistError } = await supabase
      .from("shortlists")
      .select("id")
      .eq("id", id)
      .single();
    if (shortlistError || !shortlist) {
      return NextResponse.json({ data: null, error: "Shortlist not found" }, { status: 404 });
    }

    const result = await removeDraftItem(supabase, id, itemId);
    if (!result.ok) {
      return NextResponse.json({ data: null, error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error("Error in DELETE /api/internal/shortlists/[id]/items/[itemId] - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: errorMessage }, { status: 500 });
  }
}
