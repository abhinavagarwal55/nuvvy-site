import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

type TodoRow = {
  id: string;
  text: string;
  status: "open" | "done";
  created_by: string;
  created_at: string;
  completed_by: string | null;
  completed_at: string | null;
};

const CreateSchema = z.object({
  text: z.string().trim().min(1, "To-do text is required").max(500, "Keep it under 500 characters"),
});

// Resolve created_by / completed_by uuids to profile display names.
// Two FKs point at profiles, so we map separately (the codebase pattern) rather
// than relying on FK-hint embeds.
async function attachNames(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rows: TodoRow[]
) {
  const ids = [
    ...new Set(
      rows.flatMap((r) => [r.created_by, r.completed_by]).filter((v): v is string => !!v)
    ),
  ];
  let nameById: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    nameById = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, (p.full_name as string | null) ?? "Unknown"])
    );
  }
  return rows.map((r) => ({
    ...r,
    created_by_name: nameById[r.created_by] ?? "Unknown",
    completed_by_name: r.completed_by ? nameById[r.completed_by] ?? "Unknown" : null,
  }));
}

// GET /api/ops/schedule/todos — list active (non-deleted) items, open + done
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("schedule_todos")
    .select("id, text, status, created_by, created_at, completed_by, completed_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = await attachNames(supabase, (data ?? []) as TodoRow[]);
  return NextResponse.json({ data: rows });
}

// POST /api/ops/schedule/todos — create a to-do
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("schedule_todos")
    .insert({ text: parsed.data.text, created_by: auth.userId })
    .select("id, text, status, created_by, created_at, completed_by, completed_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "todo.created",
    targetTable: "schedule_todos",
    targetId: data.id,
    metadata: { text_length: parsed.data.text.length },
    ip,
    userAgent,
  });

  const [row] = await attachNames(supabase, [data as TodoRow]);
  return NextResponse.json({ data: row }, { status: 201 });
}
