import { createClient } from "@supabase/supabase-js";

/**
 * Create Supabase admin client with service role key
 * SERVER ONLY - do not import into client components
 * 
 * This client bypasses RLS and should only be used in:
 * - API routes
 * - Server Components
 * - Server Actions
 */
export function createAdminSupabaseClient() {
  // Prefer SUPABASE_URL, fallback to NEXT_PUBLIC_SUPABASE_URL for server-side use
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (typeof url !== "string" || url.length === 0) {
    throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable");
  }

  if (typeof key !== "string" || key.length === 0) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
