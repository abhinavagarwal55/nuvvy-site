import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// ─── Ops role system (admin / horticulturist / gardener) ─────────────────────

export type OpsRole = "admin" | "horticulturist" | "gardener";

/**
 * Look up the OpsRole for a given userId from the profiles table.
 * Returns null if the user has no profile or an unrecognised role.
 */
export async function getOpsRole(userId: string): Promise<OpsRole | null> {
  const adminSupabase = createAdminSupabaseClient();
  const { data } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (
    data?.role &&
    (["admin", "horticulturist", "gardener"] as string[]).includes(data.role)
  ) {
    return data.role as OpsRole;
  }
  return null;
}

/**
 * requireOpsAccess — for Server Components in /ops/* routes.
 * Redirects to /ops/login if unauthenticated or not in allowedRoles.
 */
export async function requireOpsAccess(
  allowedRoles: OpsRole[]
): Promise<{ userId: string; role: OpsRole }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ops/login");

  const role = await getOpsRole(user.id);
  if (!role || !allowedRoles.includes(role)) {
    redirect("/ops/login?error=not_authorized");
  }

  return { userId: user.id, role };
}

interface InternalAccess {
  role: "admin" | "editor" | "viewer";
  email: string;
}

/**
 * Require internal access - checks authentication and authorization
 * Redirects to login if not authenticated or not authorized
 * Returns user and access info if authorized
 */
export async function requireInternalAccess(): Promise<{
  user: { id: string; email: string };
  access: InternalAccess;
}> {
  // First check authentication (cookie-based session)
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    redirect("/internal/login");
  }

  // Guard: ensure user.email is defined
  if (!user.email) {
    redirect("/internal/login?error=missing_email");
  }

  // Then check authorization using admin client (bypasses RLS)
  const access = await getInternalAccess(user.email);

  if (!access) {
    redirect("/internal/login?error=not_authorized");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    access,
  };
}

/**
 * Get internal access for a user email
 * Uses admin client to bypass RLS and check internal_users table
 * Returns null if user not found or disabled
 */
export async function getInternalAccess(
  userEmail: string
): Promise<InternalAccess | null> {
  try {
    // Check if service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is missing. Cannot check authorization.");
      throw new Error(
        "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for authorization checks"
      );
    }

    // Use admin client to bypass RLS
    const adminSupabase = createAdminSupabaseClient();

    const { data, error } = await adminSupabase
      .from("internal_users")
      .select("email, role")
      .eq("email", userEmail.toLowerCase())
      .eq("enabled", true)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      role: data.role as "admin" | "editor" | "viewer",
      email: data.email,
    };
  } catch (err) {
    console.error("Error checking internal access:", err);
    return null;
  }
}
