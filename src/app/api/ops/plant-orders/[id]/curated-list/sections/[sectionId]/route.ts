import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { updateSection, deleteSection } from "@/lib/services/shortlists";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    sort_order: z.number().int().optional(),
  })
  .refine((v) => v.name !== undefined || v.sort_order !== undefined, {
    message: "Nothing to update",
  });

async function guard(request: NextRequest, id: string) {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("plant_orders")
    .select("id, status, curated_shortlist_id")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return { error: NextResponse.json({ error: "Order not found" }, { status: 404 }) };
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!order.curated_shortlist_id) {
    return { error: NextResponse.json({ error: "No curated list exists for this order." }, { status: 400 }) };
  }
  if (!["interested", "finalizing"].includes(order.status)) {
    return {
      error: NextResponse.json(
        { error: "The curated list is locked once the order leaves 'interested' / 'finalizing'." },
        { status: 422 }
      ),
    };
  }
  return { supabase, shortlistId: order.curated_shortlist_id as string };
}

// PATCH /api/ops/plant-orders/[id]/curated-list/sections/[sectionId] — rename / reorder.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id, sectionId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const g = await guard(request, id);
  if (g.error) return g.error;

  const result = await updateSection(g.supabase, g.shortlistId, sectionId, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order.curated_list_section_updated",
    targetTable: "shortlist_draft_sections",
    targetId: sectionId,
    metadata: { shortlist_id: g.shortlistId, ...parsed.data },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: { success: true } });
}

// DELETE /api/ops/plant-orders/[id]/curated-list/sections/[sectionId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id, sectionId } = await params;
  const g = await guard(request, id);
  if (g.error) return g.error;

  const result = await deleteSection(g.supabase, g.shortlistId, sectionId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order.curated_list_section_deleted",
    targetTable: "shortlist_draft_sections",
    targetId: sectionId,
    metadata: { shortlist_id: g.shortlistId },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: { success: true } });
}
