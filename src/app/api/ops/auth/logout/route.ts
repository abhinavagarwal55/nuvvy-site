import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";

// POST /api/ops/auth/logout — clears Supabase session
export async function POST() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
