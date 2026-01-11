import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// UUID validation regex (basic)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Response type
interface GetShortlistResponse {
  id: string;
  type: string;
  status: string;
  snapshot: unknown;
  createdAt: string;
  updatedAt: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: "Invalid shortlist ID format" },
        { status: 400 }
      );
    }

    // Fetch from Supabase
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shortlists")
      .select("id, type, status, snapshot, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Row not found
        return NextResponse.json(
          { error: "Shortlist not found" },
          { status: 404 }
        );
      }
      console.error("Supabase fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch shortlist" },
        { status: 500 }
      );
    }

    // Build response
    const response: GetShortlistResponse = {
      id: data.id,
      type: data.type,
      status: data.status,
      snapshot: data.snapshot,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Unexpected error fetching shortlist:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
