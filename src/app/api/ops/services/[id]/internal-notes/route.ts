import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// Internal (team-only) notes for a single visit. [id] is the target visit.
// Read + written by admin/horticulturist only; never reaches the customer
// reminder. Gardeners read internal_notes through the service-detail endpoint,
// not here, and cannot write it.

// GET /api/ops/services/[id]/internal-notes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("service_visits")
    .select("internal_notes")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  return NextResponse.json({ data: { internal_notes: data.internal_notes ?? "" } });
}

const PutSchema = z.object({
  internal_notes: z.string().max(4000),
});

// PUT /api/ops/services/[id]/internal-notes
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = PutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Empty string clears the note (stored as NULL).
  const value = parsed.data.internal_notes.trim() === "" ? null : parsed.data.internal_notes;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("service_visits")
    .update({ internal_notes: value })
    .eq("id", id)
    .select("id, internal_notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  return NextResponse.json({ data: { internal_notes: data.internal_notes ?? "" } });
}
