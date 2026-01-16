import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// Helper function to check auth (reuse pattern from plants route)
async function checkAuth(): Promise<{ authorized: boolean; error?: string; status?: number }> {
  const isDevBypass =
    (process.env.INTERNAL_AUTH_BYPASS === "true" ||
      process.env.INTERNAL_AUTH_BYPASS === "1") &&
    process.env.NODE_ENV !== "production";

  if (isDevBypass) {
    return { authorized: true };
  }

  // Production path: Check authentication
  const { createServerSupabaseClient } = await import("@/lib/supabase/ssr");
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return { authorized: false, error: "Unauthorized", status: 401 };
  }

  if (!user.email) {
    return { authorized: false, error: "Forbidden: Missing user email", status: 403 };
  }

  const { getInternalAccess } = await import("@/lib/internal/authz");
  const access = await getInternalAccess(user.email);
  if (!access) {
    return { authorized: false, error: "Forbidden: Access denied", status: 403 };
  }

  return { authorized: true };
}

export async function GET(request: NextRequest) {
  try {
    const authCheck = await checkAuth();
    if (!authCheck.authorized) {
      return NextResponse.json(
        { data: null, error: authCheck.error },
        { status: authCheck.status || 401 }
      );
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
