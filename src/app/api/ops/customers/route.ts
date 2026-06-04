import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { withPerfLog } from "@/lib/perf/with-perf-log";
import { PerfContext } from "@/lib/perf/perf-context";
import { createCustomerSchema, createDraftCustomer } from "@/lib/services/customers";

// GET /api/ops/customers?status=ACTIVE&society_id=xxx&q=search
export const GET = withPerfLog('/api/ops/customers', async (request: NextRequest, ctx: PerfContext) => {
  let auth;
  try {
    auth = await ctx.trackAuth(() => requireOpsAuth(request));
  } catch (res) {
    return res as Response;
  }
  ctx.setUser(auth.userId, auth.role);
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const societyId = searchParams.get("society_id");
  const q = searchParams.get("q");

  const supabase = getSupabaseAdmin();

  // Round 1: customers with society name via FK join
  let query = supabase
    .from("customers")
    .select(
      "id, name, phone_number, address, status, society_id, plant_count_range, created_at, updated_at, societies(name)"
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (societyId) query = query.eq("society_id", societyId);
  if (q) query = query.or(`name.ilike.%${q}%,phone_number.ilike.%${q}%`);

  const { data, error } = await ctx.trackQuery(async () => await query);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Round 2: care schedules + slots + photos in parallel (only for active customers)
  const activeIds = (data ?? []).filter((c) => c.status === "ACTIVE").map((c) => c.id);
  const careScheduleMap: Record<string, number> = {};
  const slotMap: Record<string, boolean> = {};
  const photoMap: Record<string, boolean> = {};
  if (activeIds.length > 0) {
    const [{ data: careCounts }, { data: slots }, { data: photos }] = await ctx.trackQuery(async () => Promise.all([
      supabase.from("customer_care_schedules").select("customer_id").in("customer_id", activeIds),
      supabase.from("service_slots").select("customer_id").in("customer_id", activeIds).eq("is_active", true),
      supabase.from("customer_photos").select("customer_id").in("customer_id", activeIds),
    ]));
    for (const row of careCounts ?? []) {
      careScheduleMap[row.customer_id] = (careScheduleMap[row.customer_id] ?? 0) + 1;
    }
    for (const row of slots ?? []) {
      slotMap[row.customer_id] = true;
    }
    for (const row of photos ?? []) {
      photoMap[row.customer_id] = true;
    }
  }

  const customers = (data ?? []).map((c) => {
    const societyObj = c.societies as unknown as { name: string } | null;
    return {
      id: c.id,
      name: c.name,
      phone_number: c.phone_number,
      address: c.address,
      status: c.status,
      society_id: c.society_id,
      plant_count_range: c.plant_count_range,
      created_at: c.created_at,
      updated_at: c.updated_at,
      society_name: societyObj?.name ?? null,
      has_care_schedules: c.status === "ACTIVE" ? (careScheduleMap[c.id] ?? 0) > 0 : null,
      has_slot: c.status === "ACTIVE" ? slotMap[c.id] ?? false : null,
      has_photos: c.status === "ACTIVE" ? photoMap[c.id] ?? false : null,
    };
  });

  return NextResponse.json({ data: customers });
});

// POST /api/ops/customers — creates a draft customer
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
  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const result = await createDraftCustomer(supabase, parsed.data, auth.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ data: result.customer }, { status: 201 });
}
