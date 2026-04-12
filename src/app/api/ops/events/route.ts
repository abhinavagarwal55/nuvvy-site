import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

const CreateEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  event_date: z.string(), // YYYY-MM-DD
  time_start: z.string().nullable().optional(),
  time_end: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// GET /api/ops/events?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&status=active
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
  const status = searchParams.get("status") || "active";

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ops_events")
    .select("*")
    .order("event_date")
    .order("time_start");

  if (dateFrom) query = query.gte("event_date", dateFrom);
  if (dateTo) query = query.lte("event_date", dateTo);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/ops/events — create an event
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const d = parsed.data;

  const { data, error } = await supabase
    .from("ops_events")
    .insert({
      title: d.title,
      event_date: d.event_date,
      time_start: d.time_start ?? null,
      time_end: d.time_end ?? null,
      notes: d.notes ?? null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}
