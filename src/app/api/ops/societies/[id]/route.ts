import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const UpdateSocietySchema = z
  .object({
    name: z.string().min(1).optional(),
    short_name: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    total_units: z.number().int().nullable().optional(),
    contact_info: z.string().nullable().optional(),
  })
  .strict();

function reqMeta(request: NextRequest) {
  return {
    ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent") || null,
  };
}

// PATCH /api/ops/societies/[id] — update society metadata (audited).
export async function PATCH(
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
  const body = await request.json().catch(() => ({}));
  const parsed = UpdateSocietySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    // Normalize empty strings to null so "cleared" fields don't count as filled.
    updates[key] = typeof value === "string" && value.trim() === "" ? null : value;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  if (updates.name !== undefined && typeof updates.name === "string") {
    updates.name = updates.name.trim();
    if (!updates.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("societies")
    .update(updates)
    .eq("id", id)
    .select("id, name, short_name, address, total_units, contact_info")
    .single();

  if (error) {
    if (error.code === "PGRST116")
      return NextResponse.json({ error: "Society not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const meta = reqMeta(request);
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "society.updated",
    targetTable: "societies",
    targetId: id,
    metadata: { fields_changed: Object.keys(updates) },
    ...meta,
  });

  return NextResponse.json({ data });
}

// DELETE /api/ops/societies/[id] — hard delete, blocked when any customer OR
// lead references it (409 with counts). Orphan societies delete + audit.
export async function DELETE(
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
  const supabase = getSupabaseAdmin();

  const [{ count: customerCount }, { count: leadCount }] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("society_id", id),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("society_id", id),
  ]);

  const customer_count = customerCount ?? 0;
  const lead_count = leadCount ?? 0;

  if (customer_count > 0 || lead_count > 0) {
    return NextResponse.json(
      {
        error: "This society is in use and cannot be deleted.",
        customer_count,
        lead_count,
      },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("societies").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const meta = reqMeta(request);
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "society.deleted",
    targetTable: "societies",
    targetId: id,
    ...meta,
  });

  return NextResponse.json({ ok: true });
}
