import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/internal/customers/stats
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    
    // Get count of active customers
    const { count: activeCount, error: activeError } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("status", "ACTIVE");
    
    if (activeError) {
      console.error("Supabase error:", activeError);
      return NextResponse.json(
        { error: activeError.message },
        { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
    
    return NextResponse.json(
      {
        data: {
          active: activeCount || 0,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    console.error("Error in GET /api/internal/customers/stats:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
