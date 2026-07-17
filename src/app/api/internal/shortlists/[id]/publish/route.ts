import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { publishShortlist } from "@/lib/services/shortlists";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/internal/shortlists/[id]/publish
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
    const result = await publishShortlist(supabase, id, request);

    if (!result.ok) {
      return NextResponse.json({ data: null, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      data: {
        success: true,
        version_id: result.data.version_id,
        version_number: result.data.version_number,
        publicUrl: result.data.publicUrl,
      },
      error: null,
    });
  } catch (err) {
    console.error("Error in POST /api/internal/shortlists/[id]/publish - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: errorMessage }, { status: 500 });
  }
}
