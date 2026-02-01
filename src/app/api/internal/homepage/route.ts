import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { getInternalAccess } from "@/lib/internal/authz";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { HomepageSchema } from "@/lib/schemas/homepage.schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function checkAuth() {
  const isDevBypass =
    (process.env.INTERNAL_AUTH_BYPASS === "true" ||
      process.env.INTERNAL_AUTH_BYPASS === "1") &&
    process.env.NODE_ENV !== "production";

  if (isDevBypass) {
    return { authorized: true };
  }

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

  const access = await getInternalAccess(user.email);
  if (!access) {
    return { authorized: false, error: "Forbidden: Access denied", status: 403 };
  }

  return { authorized: true };
}

// GET /api/internal/homepage - Fetch draft homepage content
export async function GET() {
  try {
    const authCheck = await checkAuth();
    if (!authCheck.authorized) {
      return NextResponse.json(
        { data: null, error: authCheck.error },
        { status: authCheck.status || 401 }
      );
    }

    const adminSupabase = createAdminSupabaseClient();
    const { data, error } = await adminSupabase
      .from("homepage_content")
      .select("id, content, status, created_at")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { data: null, error: "No draft homepage content found" },
        { status: 404 }
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

// PUT /api/internal/homepage - Update draft homepage content
export async function PUT(request: NextRequest) {
  try {
    const authCheck = await checkAuth();
    if (!authCheck.authorized) {
      return NextResponse.json(
        { data: null, error: authCheck.error },
        { status: authCheck.status || 401 }
      );
    }

    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json(
        { data: null, error: "Content is required" },
        { status: 400 }
      );
    }

    // Validate content against Zod schema
    const parseResult = HomepageSchema.safeParse(content);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: `Validation failed: ${parseResult.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`,
        },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminSupabaseClient();

    // Check if draft exists
    const { data: existing } = await adminSupabase
      .from("homepage_content")
      .select("id")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let result;
    if (existing) {
      // Update existing draft
      const { data, error } = await adminSupabase
        .from("homepage_content")
        .update({
          content: parseResult.data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { data: null, error: error.message },
          { status: 500 }
        );
      }

      result = data;
    } else {
      // Create new draft
      const { data, error } = await adminSupabase
        .from("homepage_content")
        .insert({
          status: "draft",
          content: parseResult.data,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { data: null, error: error.message },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json({ data: result, error: null }, { status: 200 });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
