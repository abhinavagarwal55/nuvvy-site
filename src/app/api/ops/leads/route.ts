import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { createLeadInputSchema, normalizePhone } from "@/lib/schemas/lead.schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const todayStr = () => new Date().toISOString().split("T")[0];

// Last 10 digits — used to match a phone against customers regardless of the
// format the customer phone_number was stored in.
function last10(phone: string): string {
  const d = phone.replace(/[^\d]/g, "");
  return d.slice(-10);
}

// GET /api/ops/leads?state=&q=&source=&due=today|overdue|any
export async function GET(request: NextRequest) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { searchParams } = new URL(request.url);
  const stateParam = (searchParams.get("state") || "active").toLowerCase();
  const q = searchParams.get("q");
  const source = searchParams.get("source");
  const due = (searchParams.get("due") || "any").toLowerCase();

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("leads")
    .select(
      "id, phone, name, state, source, society_id, area, qualifiers, notes, next_action, next_action_at, closed_reason, closed_note, closed_at, converted_customer_id, converted_at, first_seen_at, last_touch_at, created_at, updated_at, societies(name)",
      { count: "exact" }
    )
    .order("last_touch_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  // State filter — `converted` is internal-only and never listed.
  if (stateParam === "any") {
    query = query.in("state", ["active", "closed"]);
  } else if (stateParam === "closed") {
    query = query.eq("state", "closed");
  } else {
    query = query.eq("state", "active");
  }

  if (source) query = query.eq("source", source);
  if (q) query = query.or(`phone.ilike.%${q}%,name.ilike.%${q}%`);

  const today = todayStr();
  if (due === "today") {
    query = query.eq("next_action_at", today);
  } else if (due === "overdue") {
    query = query.lt("next_action_at", today);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const leads = (data ?? []).map((l) => {
    const societyObj = l.societies as unknown as { name: string } | null;
    return {
      ...l,
      societies: undefined,
      society_name: societyObj?.name ?? null,
    };
  });

  return NextResponse.json({ leads, totalCount: count ?? leads.length });
}

// POST /api/ops/leads — create a lead in state='active'
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const body = await request.json();
  const parsed = createLeadInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const phone = normalizePhone(d.phone);
  if (!phone) {
    return NextResponse.json(
      { error: `Could not parse phone number: "${d.phone}"` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Block if this phone already belongs to a customer (any status).
  const { data: existingCustomers } = await supabase
    .from("customers")
    .select("id")
    .ilike("phone_number", `%${last10(phone)}%`)
    .limit(1);
  if (existingCustomers && existingCustomers.length > 0) {
    return NextResponse.json(
      {
        error: "This number already belongs to a customer",
        customer_id: existingCustomers[0].id,
      },
      { status: 400 }
    );
  }

  // Block if an active lead already exists for this phone.
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("phone", phone)
    .eq("state", "active")
    .maybeSingle();
  if (existingLead) {
    return NextResponse.json(
      { error: "An active lead already exists for this phone", existing_lead_id: existingLead.id },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      phone,
      name: d.name ?? null,
      state: "active",
      source: d.source ?? null,
      society_id: d.society_id ?? null,
      area: d.area ?? null,
      qualifiers: d.qualifiers ?? {},
      next_action: d.next_action ?? null,
      next_action_at: d.next_action_at || null,
    })
    .select()
    .single();

  if (error) {
    // Unique partial index race — surface as a 409.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "An active lead already exists for this phone" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Seed the first timeline note if one was provided on create.
  if (d.notes && d.notes.trim()) {
    await supabase.from("lead_notes").insert({
      lead_id: data.id,
      body: d.notes.trim(),
      created_by: auth.userId,
    });
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "lead.create",
    targetTable: "leads",
    targetId: data.id,
    metadata: { source: data.source },
    ip,
    userAgent,
  });

  return NextResponse.json({ data }, { status: 201 });
}
