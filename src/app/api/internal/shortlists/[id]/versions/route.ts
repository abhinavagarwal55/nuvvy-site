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

// GET /api/internal/shortlists/[id]/versions
export async function GET(
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
      .select("id, current_version_number")
      .eq("id", id)
      .single();
    
    if (shortlistError || !shortlist) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }
    
    // Fetch all versions ordered by version_number desc
    const { data: versions, error: versionsError } = await supabase
      .from("shortlist_versions")
      .select("id, version_number, status_at_time, created_at")
      .eq("shortlist_id", id)
      .order("version_number", { ascending: false });
    
    if (versionsError) {
      console.error("Error fetching versions:", versionsError);
      return NextResponse.json(
        { data: null, error: versionsError.message || "Failed to fetch versions" },
        { status: 500 }
      );
    }
    
    // Check if public link exists for this shortlist
    const { data: publicLink } = await supabase
      .from("shortlist_public_links")
      .select("id")
      .eq("shortlist_id", id)
      .eq("active", true)
      .maybeSingle();
    
    const hasPublicLink = !!publicLink;
    
    // Transform versions to include current version indicator
    const currentVersionNumber = shortlist.current_version_number || 0;
    const transformed = (versions || []).map((version: any) => ({
      id: version.id,
      version_number: version.version_number,
      status_at_time: version.status_at_time,
      created_at: version.created_at,
      is_current: version.version_number === currentVersionNumber,
      has_public_link: hasPublicLink && version.status_at_time === "SENT_TO_CUSTOMER",
    }));
    
    return NextResponse.json({
      data: transformed,
      error: null,
    });
  } catch (err) {
    console.error("Error in GET /api/internal/shortlists/[id]/versions - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
