import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

const Schema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

// POST /api/ops/services/[id]/not-completed
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

  const { id } = await params;
  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: service } = await supabase
    .from("service_visits")
    .select("id, status, assigned_gardener_id")
    .eq("id", id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (auth.role === "gardener" && service.assigned_gardener_id !== auth.gardener_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["scheduled", "in_progress"].includes(service.status)) {
    return NextResponse.json(
      { error: `Cannot mark not-completed: status is ${service.status}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("service_visits")
    .update({
      status: "not_completed",
      not_completed_reason: parsed.data.reason,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
