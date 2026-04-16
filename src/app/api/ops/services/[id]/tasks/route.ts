import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

const CreateTaskSchema = z.object({
  for_service_id: z.string().uuid("Target service is required"),
  description: z.string().min(1, "Description is required"),
});

// POST /api/ops/services/[id]/tasks — create a special task for a future service
// [id] is the review context (the service being reviewed), for_service_id is where the task goes
export async function POST(
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
  const body = await request.json();
  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("service_special_tasks")
    .insert({
      for_service_id: parsed.data.for_service_id,
      created_after_service_id: id,
      description: parsed.data.description,
      is_completed: false,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

const UpdateTaskSchema = z.object({
  task_id: z.string().uuid(),
  description: z.string().min(1, "Description is required"),
});

// PATCH /api/ops/services/[id]/tasks — update a special task's description
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

  await params; // consume params (unused but required by Next.js)
  const body = await request.json();
  const parsed = UpdateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Only allow editing tasks that haven't been completed
  const { data, error } = await supabase
    .from("service_special_tasks")
    .update({ description: parsed.data.description })
    .eq("id", parsed.data.task_id)
    .eq("is_completed", false)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Task not found or already completed" }, { status: 404 });
  return NextResponse.json({ data });
}

// DELETE /api/ops/services/[id]/tasks?task_id=xxx — delete a special task
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

  await params;
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("task_id");
  if (!taskId) {
    return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Only allow deleting tasks that haven't been completed
  const { data, error } = await supabase
    .from("service_special_tasks")
    .delete()
    .eq("id", taskId)
    .eq("is_completed", false)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Task not found or already completed" }, { status: 404 });
  return NextResponse.json({ data });
}
