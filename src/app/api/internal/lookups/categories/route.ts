import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { getInternalAccess } from "@/lib/internal/authz";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    // DEV-ONLY: Auth bypass for local development
    const isDevBypass =
      (process.env.INTERNAL_AUTH_BYPASS === "true" ||
        process.env.INTERNAL_AUTH_BYPASS === "1") &&
      process.env.NODE_ENV !== "production";

    if (!isDevBypass) {
      // Production path: Check authentication
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!user || authError) {
        return NextResponse.json(
          { data: null, error: "Unauthorized" },
          { status: 401 }
        );
      }

      if (!user.email) {
        return NextResponse.json(
          { data: null, error: "Forbidden: Missing user email" },
          { status: 403 }
        );
      }

      const access = await getInternalAccess(user.email);
      if (!access) {
        return NextResponse.json(
          { data: null, error: "Forbidden: Access denied" },
          { status: 403 }
        );
      }
    }

    const adminSupabase = createAdminSupabaseClient();
    const { data, error } = await adminSupabase
      .from("plant_categories")
      .select("id, name, slug, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 200 });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
