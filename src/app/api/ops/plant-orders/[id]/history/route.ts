import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import {
  PLANT_ORDER_STATUS_LABELS,
  ORDER_CLOSED_REASON_LABELS,
  type PlantOrderStatus,
  type OrderClosedReason,
} from "@/lib/schemas/plant-order";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Audit action → timeline event kind. `plant_order.note_added` is excluded —
// notes come straight from plant_order_notes (avoids double-listing).
const ACTION_KIND: Record<string, "created" | "status_changed" | "follow_up"> = {
  "plant_order.created": "created",
  "plant_order.status_changed": "status_changed",
  "plant_order.follow_up_set": "follow_up",
};

function statusLabel(v: unknown): string {
  return typeof v === "string"
    ? PLANT_ORDER_STATUS_LABELS[v as PlantOrderStatus] ?? v
    : "—";
}

// GET /api/ops/plant-orders/[id]/history — merged, newest-first timeline of
// notes + audited pipeline changes, each attributed to the acting user.
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

  const [{ data: notes }, { data: audits }] = await Promise.all([
    supabase
      .from("plant_order_notes")
      .select("id, body, created_at, created_by")
      .eq("plant_order_id", id),
    supabase
      .from("audit_logs")
      .select("id, action, metadata, created_at, actor_id")
      .eq("target_table", "plant_orders")
      .eq("target_id", id)
      .in("action", Object.keys(ACTION_KIND)),
  ]);

  const ids = [
    ...(notes ?? []).map((n) => n.created_by),
    ...(audits ?? []).map((a) => a.actor_id),
  ].filter((x): x is string => !!x);
  const uniqueIds = [...new Set(ids)];
  let names: Record<string, string> = {};
  if (uniqueIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", uniqueIds);
    names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name as string]));
  }

  const events = [
    ...(notes ?? []).map((n) => ({
      kind: "note" as const,
      id: n.id,
      at: n.created_at,
      actor_name: n.created_by ? names[n.created_by] ?? null : null,
      body: n.body as string | null,
      detail: null as string | null,
    })),
    ...(audits ?? []).map((a) => {
      const kind = ACTION_KIND[a.action];
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      let detail: string | null = null;
      if (kind === "created") {
        detail = statusLabel(meta.status);
      } else if (kind === "status_changed") {
        const closed =
          typeof meta.closed_reason === "string"
            ? ` (${ORDER_CLOSED_REASON_LABELS[meta.closed_reason as OrderClosedReason] ?? meta.closed_reason})`
            : "";
        detail = `${statusLabel(meta.from)} → ${statusLabel(meta.to)}${closed}`;
      } else if (kind === "follow_up") {
        detail = typeof meta.to === "string" && meta.to ? meta.to : "cleared";
      }
      return {
        kind,
        id: a.id,
        at: a.created_at,
        actor_name: a.actor_id ? names[a.actor_id] ?? null : null,
        body: null as string | null,
        detail,
      };
    }),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

  return NextResponse.json({ data: events });
}
