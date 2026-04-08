import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/societies — list all societies (for dropdown)
export async function GET(request: NextRequest) {
  try {
    await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("societies")
    .select("id, name")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/ops/societies — create a new society
export async function POST(request: NextRequest) {
  try {
    await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  const body = await request.json();
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Upsert: find existing or create
  const { data: existing } = await supabase
    .from("societies")
    .select("id, name")
    .eq("name", name)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ data: existing });
  }

  const { data, error } = await supabase
    .from("societies")
    .insert({ name })
    .select("id, name")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
