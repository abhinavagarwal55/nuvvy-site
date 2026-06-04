import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Map audit action → history event kind. Excluded on purpose:
//   • lead.note_added — notes come straight from lead_notes (avoids double-listing)
//   • lead.update     — detail edits are audit-only, too noisy for the timeline
const ACTION_KIND: Record<string, "created" | "closed" | "reactivated" | "converted" | "follow_up"> = {
  "lead.create": "created",
  "lead.close": "closed",
  "lead.reactivate": "reactivated",
  "lead.convert": "converted",
  "lead.follow_up_set": "follow_up",
};

// GET /api/ops/leads/[id]/history — merged, newest-first timeline of notes +
// audited state changes, each attributed to the acting user.
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
      .from("lead_notes")
      .select("id, body, created_at, created_by")
      .eq("lead_id", id),
    supabase
      .from("audit_logs")
      .select("id, action, metadata, created_at, actor_id")
      .eq("target_table", "leads")
      .eq("target_id", id)
      .in("action", Object.keys(ACTION_KIND)),
  ]);

  // Resolve all actor/author ids → display names in one query.
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
      body: n.body,
      detail: null as string | null,
    })),
    ...(audits ?? []).map((a) => {
      const kind = ACTION_KIND[a.action];
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      // closed → reason; follow_up → the date that was set.
      let detail: string | null = null;
      if (kind === "closed" && typeof meta.closed_reason === "string") detail = meta.closed_reason;
      if (kind === "follow_up" && typeof meta.next_action_at === "string") detail = meta.next_action_at;
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
