import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { hashPin } from "@/lib/auth/pin";
import { logAuditEvent } from "@/lib/services/audit";

// Nanoid-style token — 24 URL-safe chars
function generateLoginToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// GET /api/ops/people?role=gardener&status=active
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
  const role = searchParams.get("role");
  const status = searchParams.get("status");

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("profiles")
    .select("id, full_name, phone, role, status, created_at")
    .in("role", ["admin", "horticulturist", "gardener"])
    .order("created_at", { ascending: false });

  if (role) query = query.eq("role", role);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For gardeners, join login_token from gardeners table
  const gardenerIds = (data ?? [])
    .filter((p) => p.role === "gardener")
    .map((p) => p.id);

  let gardenerTokenMap: Record<string, string | null> = {};
  if (gardenerIds.length > 0) {
    const { data: gardeners } = await supabase
      .from("gardeners")
      .select("profile_id, login_token, pin_hash")
      .in("profile_id", gardenerIds);
    gardenerTokenMap = Object.fromEntries(
      (gardeners ?? []).map((g) => [g.profile_id, g.login_token])
    );
  }

  // For horticulturists, join email from horticulturists table
  const hortiIds = (data ?? [])
    .filter((p) => p.role === "horticulturist")
    .map((p) => p.id);

  let hortiEmailMap: Record<string, string | null> = {};
  if (hortiIds.length > 0) {
    const { data: hortis } = await supabase
      .from("horticulturists")
      .select("profile_id, email")
      .in("profile_id", hortiIds);
    hortiEmailMap = Object.fromEntries(
      (hortis ?? []).map((h) => [h.profile_id, h.email])
    );
  }

  // For admins, get email from auth.users
  const adminIds = (data ?? [])
    .filter((p) => p.role === "admin")
    .map((p) => p.id);

  let adminEmailMap: Record<string, string | null> = {};
  for (const adminId of adminIds) {
    const { data: authUser } = await supabase.auth.admin.getUserById(adminId);
    if (authUser?.user?.email) {
      adminEmailMap[adminId] = authUser.user.email;
    }
  }

  const people = (data ?? []).map((p) => ({
    ...p,
    login_token: gardenerTokenMap[p.id] ?? null,
    email: hortiEmailMap[p.id] ?? adminEmailMap[p.id] ?? null,
  }));

  return NextResponse.json({ data: people });
}

const CreatePersonSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("gardener"),
    full_name: z.string().min(1),
    phone: z.string().optional(),
    pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
  }),
  z.object({
    role: z.literal("horticulturist"),
    full_name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().email(),
  }),
]);

// POST /api/ops/people — admin only
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreatePersonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  if (parsed.data.role === "gardener") {
    const { full_name, phone, pin } = parsed.data;

    // Create synthetic Supabase auth user (gardeners don't use real email login)
    const login_token = generateLoginToken();
    const syntheticEmail = `gardener-${login_token}@internal.nuvvy.in`;

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      user_metadata: { role: "gardener" },
    });
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    // Create profile
    const { error: profileError } = await supabase.from("profiles").insert({
      id: authUser.user.id,
      full_name,
      phone: phone ?? null,
      role: "gardener",
      status: "active",
    });
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Hash PIN and create gardener row with login token
    const pin_hash = await hashPin(pin);
    const { data: gardener, error: gardenerError } = await supabase
      .from("gardeners")
      .insert({
        profile_id: authUser.user.id,
        phone: phone ?? null,
        pin_hash,
        login_token,
        is_active: true,
      })
      .select("id, login_token")
      .single();

    if (gardenerError) {
      return NextResponse.json({ error: gardenerError.message }, { status: 500 });
    }

    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
    const userAgent = request.headers.get("user-agent") || null;

    logAuditEvent({
      actorId: auth.userId, actorRole: auth.role, action: "person.created",
      targetTable: "profiles", targetId: authUser.user.id,
      metadata: { role: "gardener", full_name },
      ip,
      userAgent,
    });

    return NextResponse.json({
      data: { id: authUser.user.id, login_token: gardener.login_token },
    });
  }

  // Horticulturist
  const { full_name, phone, email } = parsed.data;

  // Check email uniqueness
  const { data: existing } = await supabase
    .from("horticulturists")
    .select("id")
    .eq("email", email)
    .single();
  if (existing) {
    return NextResponse.json(
      { error: "A horticulturist with this email already exists" },
      { status: 409 }
    );
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role: "horticulturist" },
  });
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authUser.user.id,
    full_name,
    phone: phone ?? null,
    role: "horticulturist",
    status: "active",
  });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  await supabase.from("horticulturists").insert({
    profile_id: authUser.user.id,
    email,
    is_active: true,
  });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId, actorRole: auth.role, action: "person.created",
    targetTable: "profiles", targetId: authUser.user.id,
    metadata: { role: "horticulturist", full_name, email },
    ip,
    userAgent,
  });

  return NextResponse.json({ data: { id: authUser.user.id } });
}
