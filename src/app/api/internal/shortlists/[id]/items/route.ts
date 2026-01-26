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

// POST /api/internal/shortlists/[id]/items
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { plant_id } = body;

    if (!id) {
      return NextResponse.json(
        { data: null, error: "Shortlist ID is required" },
        { status: 400 }
      );
    }

    if (!plant_id) {
      return NextResponse.json(
        { data: null, error: "Plant ID is required" },
        { status: 400 }
      );
    }

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

    // Check if item already exists
    const { data: existing } = await supabase
      .from("shortlist_draft_items")
      .select("id")
      .eq("shortlist_id", id)
      .eq("plant_id", plant_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { data: existing, error: null },
        { status: 200 }
      );
    }

    // Create new item
    const { data: item, error: insertError } = await supabase
      .from("shortlist_draft_items")
      .insert({
        shortlist_id: id,
        plant_id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating item - full Supabase error:", insertError);
      return NextResponse.json(
        {
          data: null,
          error: insertError.message || insertError.details || "Failed to add plant to shortlist",
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
      data: item,
      error: null,
    });
  } catch (err) {
    console.error("Error in POST /api/internal/shortlists/[id]/items - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
