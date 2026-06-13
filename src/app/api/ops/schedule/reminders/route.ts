import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { getCachedCareActionTypes } from "@/lib/cache/reference-data";
import {
  REMINDER_TEMPLATE_KEY,
  REMINDER_STANDARD_LINES_KEY,
  DEFAULT_REMINDER_TEMPLATE,
  careActionLabel,
  parseStandardLines,
  getRelativeDay,
  timeWindowPhrase,
  buildFocusBlock,
  renderReminderTemplate,
  todayIST,
} from "@/lib/reminders/template";

// GET /api/ops/schedule/reminders?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "date_from and date_to are required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 1. Upcoming scheduled visits in range
  const { data: visits, error } = await supabase
    .from("service_visits")
    .select("id, customer_id, scheduled_date, time_window_start, time_window_end, status")
    .eq("status", "scheduled")
    .gte("scheduled_date", dateFrom)
    .lte("scheduled_date", dateTo)
    .order("scheduled_date", { ascending: true })
    .order("time_window_start", { ascending: true, nullsFirst: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!visits || visits.length === 0) return NextResponse.json({ data: [] });

  const customerIds = [...new Set(visits.map((v) => v.customer_id))];
  const visitIds = visits.map((v) => v.id);

  // 2..5 batched lookups (fixed query count)
  const [{ data: customers }, { data: schedules }, { data: specialTasks }, { data: config }] =
    await Promise.all([
      supabase.from("customers").select("id, name").in("id", customerIds),
      supabase
        .from("customer_care_schedules")
        .select("customer_id, care_action_type_id, next_due_date")
        .in("customer_id", customerIds),
      supabase
        .from("service_special_tasks")
        .select("for_service_id, description")
        .in("for_service_id", visitIds)
        .eq("is_completed", false),
      supabase
        .from("system_config")
        .select("key, value")
        .in("key", [REMINDER_TEMPLATE_KEY, REMINDER_STANDARD_LINES_KEY]),
    ]);

  const cfg = Object.fromEntries((config ?? []).map((r) => [r.key, r.value]));
  const template = cfg[REMINDER_TEMPLATE_KEY] ?? DEFAULT_REMINDER_TEMPLATE;
  const standardLines = parseStandardLines(cfg[REMINDER_STANDARD_LINES_KEY]);

  const nameById = new Map((customers ?? []).map((c) => [c.id, c.name as string]));

  const careTypes = await getCachedCareActionTypes();
  const careTypeName = new Map(careTypes.map((t) => [t.id, t.name]));

  const schedulesByCustomer = new Map<
    string,
    { care_action_type_id: string; next_due_date: string | null }[]
  >();
  for (const s of schedules ?? []) {
    const arr = schedulesByCustomer.get(s.customer_id) ?? [];
    arr.push({ care_action_type_id: s.care_action_type_id, next_due_date: s.next_due_date });
    schedulesByCustomer.set(s.customer_id, arr);
  }

  const tasksByVisit = new Map<string, string[]>();
  for (const t of specialTasks ?? []) {
    const arr = tasksByVisit.get(t.for_service_id) ?? [];
    if (t.description?.trim()) arr.push(t.description.trim());
    tasksByVisit.set(t.for_service_id, arr);
  }

  const today = todayIST();

  const data = visits.map((v) => {
    const name = nameById.get(v.customer_id) ?? null;
    const firstName = name ? name.split(/\s+/)[0] : "there";

    const due = (schedulesByCustomer.get(v.customer_id) ?? []).filter(
      (s) => s.next_due_date && s.next_due_date <= v.scheduled_date
    );
    const careLines = due
      .map((s) => careTypeName.get(s.care_action_type_id))
      .filter((n): n is string => !!n)
      .map(careActionLabel);
    const taskLines = tasksByVisit.get(v.id) ?? [];

    const rel = getRelativeDay(v.scheduled_date, today);
    const draft_message = renderReminderTemplate(template, {
      customer_name: firstName,
      day: rel.day,
      time_window: timeWindowPhrase(v.time_window_start, v.time_window_end),
      focus_items: buildFocusBlock(careLines, taskLines, standardLines),
    });

    return {
      id: v.id,
      customer_id: v.customer_id,
      customer_name: name ?? "Unknown",
      scheduled_date: v.scheduled_date,
      time_window_start: v.time_window_start,
      time_window_end: v.time_window_end,
      day_label: rel.label,
      draft_message,
    };
  });

  return NextResponse.json({ data });
}
