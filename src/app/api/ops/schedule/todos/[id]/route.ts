import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const PatchSchema = z.object({
  status: z.enum(["open", "done"]),
});

// PATCH /api/ops/schedule/todos/[id] — toggle status (done ⇄ open)
export async function PATCH(
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
  const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("schedule_todos")
    .select("id, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "To-do not found" }, { status: 404 });
  }

  const toDone = parsed.data.status === "done";
  const update = toDone
    ? { status: "done", completed_by: auth.userId, completed_at: new Date().toISOString() }
    : { status: "open", completed_by: null, completed_at: null };

  const { data, error } = await supabase
    .from("schedule_todos")
    .update(update)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, status, completed_by, completed_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: toDone ? "todo.completed" : "todo.reopened",
    targetTable: "schedule_todos",
    targetId: id,
    ip,
    userAgent,
  });

  return NextResponse.json({ data });
}

// DELETE /api/ops/schedule/todos/[id] — soft delete (retained for audit)
export async function DELETE(
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
    .from("schedule_todos")
    .update({ deleted_at: new Date().toISOString(), deleted_by: auth.userId })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "To-do not found" }, { status: 404 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "todo.deleted",
    targetTable: "schedule_todos",
    targetId: id,
    ip,
    userAgent,
  });

  return NextResponse.json({ data: { id } });
}
