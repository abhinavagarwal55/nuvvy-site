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

// GET /api/internal/shortlists/[id]/versions/[version]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const { id, version } = await params;
    
    if (!id) {
      return NextResponse.json(
        { data: null, error: "Shortlist ID is required" },
        { status: 400 }
      );
    }
    
    const versionNumber = parseInt(version, 10);
    if (isNaN(versionNumber)) {
      return NextResponse.json(
        { data: null, error: "Invalid version number" },
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
    
    // Fetch the specific version
    const { data: versionData, error: versionError } = await supabase
      .from("shortlist_versions")
      .select("id, version_number, status_at_time, created_at")
      .eq("shortlist_id", id)
      .eq("version_number", versionNumber)
      .single();
    
    if (versionError || !versionData) {
      return NextResponse.json(
        { data: null, error: "Version not found" },
        { status: 404 }
      );
    }
    
    // Fetch version items (snapshot)
    const { data: versionItems, error: itemsError } = await supabase
      .from("shortlist_version_items")
      .select(`
        id,
        plant_id,
        quantity,
        note,
        why_picked_for_balcony,
        plant:plants (
          id,
          name,
          scientific_name,
          price_band,
          light,
          watering_requirement,
          thumbnail_url,
          thumbnail_storage_url,
          image_url,
          image_storage_url
        )
      `)
      .eq("shortlist_version_id", versionData.id);
    
    if (itemsError) {
      console.error("Error fetching version items:", itemsError);
      return NextResponse.json(
        { data: null, error: itemsError.message || "Failed to fetch version items" },
        { status: 500 }
      );
    }
    
    // Transform items to match the format expected by the UI
    const transformedItems = (versionItems || []).map((item: any) => ({
      id: item.id,
      plant_id: item.plant_id,
      quantity: item.quantity,
      note: item.note,
      why_picked_for_balcony: item.why_picked_for_balcony,
      plant: item.plant,
    }));
    
    return NextResponse.json({
      data: {
        version: versionData,
        items: transformedItems,
      },
      error: null,
    });
  } catch (err) {
    console.error("Error in GET /api/internal/shortlists/[id]/versions/[version] - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
