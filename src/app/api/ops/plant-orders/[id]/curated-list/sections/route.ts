import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { createSection } from "@/lib/services/shortlists";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({ name: z.string().trim().min(1, "Section name is required") });

// Load the order-bound curated list and guard that it's still editable.
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

// POST /api/ops/plant-orders/[id]/curated-list/sections — add a section.
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
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const g = await guard(request, id);
  if (g.error) return g.error;

  const result = await createSection(g.supabase, g.shortlistId, parsed.data.name);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order.curated_list_section_created",
    targetTable: "shortlist_draft_sections",
    targetId: result.data.id,
    metadata: { shortlist_id: g.shortlistId, name: parsed.data.name },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: result.data }, { status: 201 });
}
