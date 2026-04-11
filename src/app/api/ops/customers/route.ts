import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/customers?status=ACTIVE&society_id=xxx&q=search
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

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Round 2: care schedules + slots in parallel (only for active customers)
  const activeIds = (data ?? []).filter((c) => c.status === "ACTIVE").map((c) => c.id);
  let careScheduleMap: Record<string, number> = {};
  let slotMap: Record<string, boolean> = {};
  if (activeIds.length > 0) {
    const [{ data: careCounts }, { data: slots }] = await Promise.all([
      supabase.from("customer_care_schedules").select("customer_id").in("customer_id", activeIds),
      supabase.from("service_slots").select("customer_id").in("customer_id", activeIds).eq("is_active", true),
    ]);
    for (const row of careCounts ?? []) {
      careScheduleMap[row.customer_id] = (careScheduleMap[row.customer_id] ?? 0) + 1;
    }
    for (const row of slots ?? []) {
      slotMap[row.customer_id] = true;
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
    };
  });

  return NextResponse.json({ data: customers });
}

const CreateCustomerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone_number: z.string().min(1, "Phone number is required"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  society_id: z.string().uuid().optional(),
  society_name: z.string().optional(), // for creating a new society inline
  plant_count_range: z
    .enum(["0_20", "20_40", "40_plus"])
    .optional(),
  light_condition: z.string().optional(),
  watering_responsibility: z.array(z.string()).optional(),
  house_help_phone: z.string().optional(),
  garden_notes: z.string().optional(),
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
  const parsed = CreateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const d = parsed.data;

  // If society_name provided without society_id, create the society
  let societyId = d.society_id ?? null;
  if (!societyId && d.society_name) {
    // Upsert: find existing or create
    const { data: existing } = await supabase
      .from("societies")
      .select("id")
      .eq("name", d.society_name)
      .single();

    if (existing) {
      societyId = existing.id;
    } else {
      const { data: newSociety, error: socErr } = await supabase
        .from("societies")
        .insert({ name: d.society_name })
        .select("id")
        .single();
      if (socErr)
        return NextResponse.json({ error: socErr.message }, { status: 500 });
      societyId = newSociety.id;
    }
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: d.name,
      phone_number: d.phone_number,
      email: d.email || null,
      address: d.address ?? null,
      status: "DRAFT",
      society_id: societyId,
      plant_count_range: d.plant_count_range ?? null,
      light_condition: d.light_condition ?? null,
      watering_responsibility: d.watering_responsibility ?? null,
      house_help_phone: d.house_help_phone ?? null,
      garden_notes: d.garden_notes ?? null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}
