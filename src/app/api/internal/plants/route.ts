import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { getInternalAccess } from "@/lib/internal/authz";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    // Check authentication
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

    // Guard: ensure user.email is defined
    if (!user.email) {
      return NextResponse.json(
        { data: null, error: "Forbidden: Missing user email" },
        { status: 403 }
      );
    }

    // Check authorization (must be in internal_users table)
    const access = await getInternalAccess(user.email);
    if (!access) {
      return NextResponse.json(
        { data: null, error: "Forbidden: Access denied" },
        { status: 403 }
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const limitParam = searchParams.get("limit");
    const searchQuery = searchParams.get("q");
    const publishedOnlyParam = searchParams.get("publishedOnly");

    // Parse limit (default 50, max 200)
    let limit = 50;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 200);
      }
    }

    // Parse publishedOnly
    const publishedOnly = publishedOnlyParam === "true";

    const adminSupabase = createAdminSupabaseClient();

    // Build query
    let query = adminSupabase.from("plants").select("*");

    // Apply search filter if provided
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim();
      // Use PostgREST or syntax: column.operator.value,column.operator.value
      // Note: ilike with % wildcards needs proper escaping in the or() method
      query = query.or(`name.ilike.%${searchTerm}%,scientific_name.ilike.%${searchTerm}%`);
    }

    // Apply published filter if requested
    if (publishedOnly) {
      query = query.eq("can_be_procured", true);
    }

    // Apply sorting - try updated_at first, fallback to created_at or name
    // Note: We'll let Supabase handle missing columns gracefully
    query = query.order("updated_at", { ascending: false, nullsFirst: false });
    query = query.limit(limit);

    const { data, error } = await query;

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
