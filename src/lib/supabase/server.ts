import { createClient } from "@supabase/supabase-js";

/**
 * Get Supabase admin client with service role key
 * Pages-safe: No App Router dependencies
 * 
 * IMPORTANT: This function must only be used in server-side code (API routes, server components)
 * Never import this in client components
 */
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Validate env vars are strings with length > 0
  if (typeof url !== "string" || url.length === 0 || typeof key !== "string" || key.length === 0) {
    throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
