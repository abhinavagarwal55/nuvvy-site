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
