import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadFollowUpItem = {
  id: string;
  name: string | null;
  phone: string;
  society_name: string | null;
  area: string | null;
  next_action: string | null;
  next_action_at: string | null;
};

export type LeadFollowUps = {
  overdue_count: number;
  today_count: number;
  items: LeadFollowUpItem[]; // top 5
};

/**
 * Compute the "Lead follow-ups" payload folded into the ops dashboard endpoints.
 * Active leads with a follow-up date that is due today or overdue. Top 5 by
 * next_action_at ASC (most urgent first), then last_touch_at DESC.
 */
export async function getLeadFollowUps(
  supabase: SupabaseClient
): Promise<LeadFollowUps> {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("leads")
    .select("id, name, phone, area, next_action, next_action_at, last_touch_at, societies(name)")
    .eq("state", "active")
    .not("next_action_at", "is", null)
    .lte("next_action_at", today)
    .order("next_action_at", { ascending: true })
    .order("last_touch_at", { ascending: false, nullsFirst: false });

  const rows = data ?? [];
  let overdue = 0;
  let todayCount = 0;
  for (const r of rows) {
    if (r.next_action_at && r.next_action_at < today) overdue++;
    else if (r.next_action_at === today) todayCount++;
  }

  const items: LeadFollowUpItem[] = rows.slice(0, 5).map((r) => {
    const societyObj = r.societies as unknown as { name: string } | null;
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      society_name: societyObj?.name ?? null,
      area: r.area,
      next_action: r.next_action,
      next_action_at: r.next_action_at,
    };
  });

  return { overdue_count: overdue, today_count: todayCount, items };
}
