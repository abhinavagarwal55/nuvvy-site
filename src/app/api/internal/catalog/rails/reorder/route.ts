import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";
import { railReorderSchema } from "@/lib/catalog/railTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST — reorder rails. The provided list MUST be the full order for one
// segment. We renumber display_order to 1, 2, 3, … in array order.
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }
  const body = await request.json().catch(() => null);
  const parsed = railReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { ordered_rail_ids } = parsed.data;

  const supabase = getSupabaseAdmin();
  for (let i = 0; i < ordered_rail_ids.length; i++) {
    const { error } = await supabase
      .from("curated_rails")
      .update({ display_order: i + 1, updated_by: auth.userId })
      .eq("id", ordered_rail_ids[i]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "curated_rail.reordered",
    targetTable: "curated_rails",
    targetId: ordered_rail_ids[0],
    metadata: { new_order: ordered_rail_ids },
  });
  return NextResponse.json({ data: { ok: true } });
}
