import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

const CreateRequestSchema = z.object({
  customer_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  type: z.enum(["problem", "service_request", "other", "client_request"]),
  description: z.string().min(1, "Description is required"),
});

// POST /api/ops/requests — create a request (gardener during visit or horti standalone)
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  const body = await request.json();
  const parsed = CreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Gardeners can only create requests "during service" — service_id is required
  if (auth.role === "gardener" && !parsed.data.service_id) {
    return NextResponse.json(
      { error: "Gardeners must link requests to a service" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("requests")
    .insert({
      customer_id: parsed.data.customer_id,
      service_id: parsed.data.service_id ?? null,
      type: parsed.data.type,
      description: parsed.data.description,
      status: "open",
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}

// GET /api/ops/requests?customer_id=xxx&status=open
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
  const customerId = searchParams.get("customer_id");
  const status = searchParams.get("status");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (customerId) query = query.eq("customer_id", customerId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
