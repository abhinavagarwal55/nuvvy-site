import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth, requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const norm = (s: string) => s.trim().toLowerCase();

// GET /api/ops/societies — list societies with metadata + in-use customer count.
// Objects still carry { id, name, ... } so existing dropdown consumers keep working.
export async function GET(request: NextRequest) {
  try {
    await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("societies")
    .select("id, name, short_name, address, total_units, contact_info")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Batched ACTIVE-customer count (single query, grouped in JS — no N+1).
  const counts: Record<string, number> = {};
  const ids = (data ?? []).map((s) => s.id);
  if (ids.length > 0) {
    const { data: custRows } = await supabase
      .from("customers")
      .select("society_id")
      .eq("status", "ACTIVE")
      .in("society_id", ids);
    for (const row of custRows ?? []) {
      if (row.society_id) counts[row.society_id] = (counts[row.society_id] ?? 0) + 1;
    }
  }

  const result = (data ?? []).map((s) => ({ ...s, customer_count: counts[s.id] ?? 0 }));
  return NextResponse.json({ data: result });
}

// POST /api/ops/societies — create a society (backs both the inline quick-add
// and the Settings page). Normalized (trim + case-insensitive) dedup: an
// existing match is returned as-is and its short_name is NOT overwritten.
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Dedup by normalized name. ilike is case-insensitive; verify exact normalized
  // equality in JS so we never create a case/whitespace-variant duplicate.
  const { data: candidates } = await supabase
    .from("societies")
    .select("id, name, short_name, address, total_units, contact_info")
    .ilike("name", name);
  const existing = (candidates ?? []).find((c) => norm(c.name) === norm(name));
  if (existing) {
    // Return as-is — do NOT overwrite short_name with the inline value.
    return NextResponse.json({ data: existing });
  }

  const insert: Record<string, unknown> = { name };
  if (typeof body.short_name === "string" && body.short_name.trim()) insert.short_name = body.short_name.trim();
  if (typeof body.address === "string" && body.address.trim()) insert.address = body.address.trim();
  if (body.total_units !== undefined && body.total_units !== null && body.total_units !== "") {
    const n = Number(body.total_units);
    if (Number.isFinite(n)) insert.total_units = Math.trunc(n);
  }
  if (typeof body.contact_info === "string" && body.contact_info.trim()) insert.contact_info = body.contact_info.trim();

  const { data, error } = await supabase
    .from("societies")
    .insert(insert)
    .select("id, name, short_name, address, total_units, contact_info")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "society.created",
    targetTable: "societies",
    targetId: data.id,
    metadata: { name: data.name },
    ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent") || null,
  });

  return NextResponse.json({ data }, { status: 201 });
}
