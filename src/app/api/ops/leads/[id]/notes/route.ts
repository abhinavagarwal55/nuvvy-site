import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { createLeadNoteSchema } from "@/lib/schemas/lead.schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Resolve profile ids → display names in one query.
async function resolveNames(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ids: (string | null)[]
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name as string]));
}

// GET /api/ops/leads/[id]/notes — newest first, with author name.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lead_notes")
    .select("id, body, created_at, created_by")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const names = await resolveNames(supabase, (data ?? []).map((n) => n.created_by));
  const notes = (data ?? []).map((n) => ({
    id: n.id,
    body: n.body,
    created_at: n.created_at,
    author_name: n.created_by ? names[n.created_by] ?? null : null,
  }));

  return NextResponse.json({ data: notes });
}

// POST /api/ops/leads/[id]/notes — append a timeline note; bumps last_touch_at.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = createLeadNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Lead must exist (notes are allowed in both active AND closed states).
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("lead_notes")
    .insert({ lead_id: id, body: parsed.data.body, created_by: auth.userId })
    .select("id, body, created_at, created_by")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("leads").update({ last_touch_at: new Date().toISOString() }).eq("id", id);

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "lead.note_added",
    targetTable: "leads",
    targetId: id,
    metadata: { note_id: data.id },
    ip,
    userAgent,
  });

  const names = await resolveNames(supabase, [data.created_by]);
  return NextResponse.json(
    {
      data: {
        id: data.id,
        body: data.body,
        created_at: data.created_at,
        author_name: data.created_by ? names[data.created_by] ?? null : null,
      },
    },
    { status: 201 }
  );
}
