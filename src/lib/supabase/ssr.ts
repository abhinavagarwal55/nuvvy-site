import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Create a Supabase client for use in Server Components and Route Handlers (App Router only)
 * Reads/writes auth cookies using Next.js cookies() API
 * Must be called from server-side code only
 * 
 * NOTE: This file uses next/headers which is App Router only.
 * For pages router compatibility, use getSupabaseAdmin() from server.ts
 * 
 * In Next.js 15, cookies() is async, so this function must be awaited.
 */
export async function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (typeof url !== "string" || url.length === 0) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
  }

  if (typeof key !== "string" || key.length === 0) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          // Ignore cookie setting errors in middleware/edge runtime
          // They will be handled by the route handler
        }
      },
    },
  });
}
