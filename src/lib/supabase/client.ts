import { createClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client for use in Client Components (browser)
 * Uses public anon key - safe for client-side use
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (typeof url !== "string" || url.length === 0) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
  }

  if (typeof key !== "string" || key.length === 0) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
  }

  return createClient(url, key);
}
