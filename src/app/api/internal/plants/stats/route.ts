import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    try {
      await requireOpsRole(request, ["admin", "horticulturist"]);
    } catch (res) {
      return res as Response;
    }

    const adminSupabase = createAdminSupabaseClient();

    // Get total count
    const { count: totalCount, error: totalError } = await adminSupabase
      .from("plants")
      .select("*", { count: "exact", head: true });

    if (totalError) {
      throw new Error(totalError.message);
    }

    // Get published count (can_be_procured = true)
    const { count: publishedCount, error: publishedError } = await adminSupabase
      .from("plants")
      .select("*", { count: "exact", head: true })
      .eq("can_be_procured", true);

    if (publishedError) {
      throw new Error(publishedError.message);
    }

    // Calculate unpublished count
    const unpublishedCount = (totalCount || 0) - (publishedCount || 0);

    return NextResponse.json(
      {
        data: {
          total: totalCount || 0,
          published: publishedCount || 0,
          unpublished: unpublishedCount,
        },
        error: null,
      },
      { status: 200 }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
