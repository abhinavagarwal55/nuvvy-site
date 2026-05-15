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

    // Get last 5 plants ordered by updated_at desc
    const { data, error } = await adminSupabase
      .from("plants")
      .select("id, name, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(
      {
        data: data || [],
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
