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

// GET /api/internal/homepage - Fetch featured plants
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
      .select("id, content, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    if (!data || !data.content) {
      return NextResponse.json(
        { data: { plantIds: [] }, error: null },
        { status: 200 }
      );
    }

    // Extract only mostPopularPlants.plantIds
    const content = data.content as any;
    const plantIds = content?.mostPopularPlants?.plantIds || [];

    return NextResponse.json({ data: { plantIds }, error: null }, { status: 200 });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}

// PUT /api/internal/homepage - Update featured plants
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
    const { plantIds } = body;

    if (!Array.isArray(plantIds)) {
      return NextResponse.json(
        { data: null, error: "plantIds must be an array" },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminSupabaseClient();

    // Get existing content or create minimal structure
    const { data: existing } = await adminSupabase
      .from("homepage_content")
      .select("id, content")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Build minimal content object with only mostPopularPlants
    const minimalContent = {
      schemaVersion: 1,
      mostPopularPlants: {
        title: "Choose from 150+ Plants",
        plantIds: plantIds,
      },
    };

    let result;
    if (existing && existing.content) {
      // Update existing content, preserving other fields if they exist
      const existingContent = existing.content as any;
      const updatedContent = {
        ...existingContent,
        mostPopularPlants: minimalContent.mostPopularPlants,
      };

      const { data, error } = await adminSupabase
        .from("homepage_content")
        .update({
          content: updatedContent,
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
      // Create new content with minimal structure
      const { data, error } = await adminSupabase
        .from("homepage_content")
        .insert({
          content: minimalContent,
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
