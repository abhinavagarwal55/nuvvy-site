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

  // Use getSession() instead of getUser() — reads the JWT locally from cookies
  // with no network round-trip (~1ms vs ~200ms+). This is safe because middleware
  // already called getUser() to verify the token and refresh it if needed.
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = session.user;

  const adminSupabase = getSupabaseAdmin();

  // Single query: fetch profile + gardener row (if exists) via FK join
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role, status, inactive_since, gardeners(id)")
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

  // Extract gardener_id from joined result (array of gardener rows, take first)
  const gardenersArr = profile.gardeners as unknown as { id: string }[] | null;
  const gardener_id = gardenersArr?.[0]?.id ?? null;

  return {
    userId: user.id,
    role: profile.role as OpsRole,
    gardener_id,
  };
}
