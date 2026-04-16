import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/services/[id]/gardeners — list all gardeners assigned to a service
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("service_visit_gardeners")
    .select("id, gardener_id, assigned_at")
    .eq("service_id", id)
    .order("assigned_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve gardener names
  const gardenerIds = (data ?? []).map((r) => r.gardener_id);
  let gardenerNames: Record<string, string> = {};
  if (gardenerIds.length > 0) {
    const { data: gardeners } = await supabase
      .from("gardeners")
      .select("id, profile_id")
      .in("id", gardenerIds);
    const profileIds = (gardeners ?? []).map((g) => g.profile_id).filter(Boolean);
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);
      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"])
      );
      gardenerNames = Object.fromEntries(
        (gardeners ?? []).map((g) => [
          g.id,
          g.profile_id ? profileMap[g.profile_id] ?? "Unknown" : "Unknown",
        ])
      );
    }
  }

  // Get primary gardener from service_visits
  const { data: service } = await supabase
    .from("service_visits")
    .select("assigned_gardener_id")
    .eq("id", id)
    .single();

  const result = (data ?? []).map((r) => ({
    id: r.id,
    gardener_id: r.gardener_id,
    gardener_name: gardenerNames[r.gardener_id] ?? "Unknown",
    is_primary: r.gardener_id === service?.assigned_gardener_id,
    assigned_at: r.assigned_at,
  }));

  void auth; // used for auth check
  return NextResponse.json({ data: result });
}

const AddGardenerSchema = z.object({
  gardener_id: z.string().uuid("gardener_id must be a valid UUID"),
});

// POST /api/ops/services/[id]/gardeners — add a gardener to a service
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = AddGardenerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verify service exists and is assignable
  const { data: service } = await supabase
    .from("service_visits")
    .select("id, status, assigned_gardener_id")
    .eq("id", id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  if (!["scheduled", "in_progress"].includes(service.status)) {
    return NextResponse.json({ error: `Cannot modify gardeners: status is '${service.status}'` }, { status: 409 });
  }

  // Verify gardener exists
  const { data: gardener } = await supabase
    .from("gardeners")
    .select("id")
    .eq("id", parsed.data.gardener_id)
    .single();

  if (!gardener) {
    return NextResponse.json({ error: "Gardener not found" }, { status: 404 });
  }

  // Insert into junction table
  const { data, error } = await supabase
    .from("service_visit_gardeners")
    .insert({
      service_id: id,
      gardener_id: parsed.data.gardener_id,
      assigned_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Gardener already assigned to this service" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If no primary gardener yet, set this one as primary
  if (!service.assigned_gardener_id) {
    await supabase
      .from("service_visits")
      .update({ assigned_gardener_id: parsed.data.gardener_id })
      .eq("id", id);
  }

  return NextResponse.json({ data }, { status: 201 });
}

// DELETE /api/ops/services/[id]/gardeners?gardener_id=xxx — remove a gardener from a service
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const gardenerId = searchParams.get("gardener_id");
  if (!gardenerId) {
    return NextResponse.json({ error: "gardener_id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verify service is modifiable
  const { data: service } = await supabase
    .from("service_visits")
    .select("id, status, assigned_gardener_id")
    .eq("id", id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  if (!["scheduled", "in_progress"].includes(service.status)) {
    return NextResponse.json({ error: `Cannot modify gardeners: status is '${service.status}'` }, { status: 409 });
  }

  // Remove from junction table
  const { data, error } = await supabase
    .from("service_visit_gardeners")
    .delete()
    .eq("service_id", id)
    .eq("gardener_id", gardenerId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Gardener not assigned to this service" }, { status: 404 });
  }

  // If we removed the primary gardener, promote the next one
  if (service.assigned_gardener_id === gardenerId) {
    const { data: remaining } = await supabase
      .from("service_visit_gardeners")
      .select("gardener_id")
      .eq("service_id", id)
      .order("assigned_at")
      .limit(1);

    await supabase
      .from("service_visits")
      .update({ assigned_gardener_id: remaining?.[0]?.gardener_id ?? null })
      .eq("id", id);
  }

  return NextResponse.json({ data });
}
