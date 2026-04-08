import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type OpsRole = "admin" | "horticulturist" | "gardener";

export type OpsAuthContext = {
  userId: string;
  role: OpsRole;
  gardener_id: string | null; // only set if role === 'gardener'
};

/**
 * requireOpsAuth — for API route handlers in /api/ops/*.
 * Reads the Supabase session from the incoming request cookies.
 * Throws a Response (401/403) if auth fails — catch it in the route handler.
 *
 * Usage:
 *   let auth: OpsAuthContext
 *   try { auth = await requireOpsAuth(request) }
 *   catch (res) { return res as Response }
 */
export async function requireOpsAuth(request: NextRequest): Promise<OpsAuthContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Build a server client that reads cookies from the incoming request
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op in API route context — cookies are set on the response, not here
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const adminSupabase = getSupabaseAdmin();
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role, status, inactive_since")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !(["admin", "horticulturist", "gardener"] as string[]).includes(profile.role)
  ) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Deactivated users are immediately locked out
  if (profile.status === "inactive" || profile.inactive_since) {
    throw new Response(
      JSON.stringify({ error: "Account deactivated. Contact your admin." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  let gardener_id: string | null = null;
  if (profile.role === "gardener") {
    const { data: gardener } = await adminSupabase
      .from("gardeners")
      .select("id")
      .eq("profile_id", user.id)
      .single();
    gardener_id = gardener?.id ?? null;
  }

  return {
    userId: user.id,
    role: profile.role as OpsRole,
    gardener_id,
  };
}
