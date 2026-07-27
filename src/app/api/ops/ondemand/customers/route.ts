import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { createDraftCustomer, type CreateCustomerInput } from "@/lib/services/customers";
import { ONDEMAND_SOURCES } from "@/lib/services/ondemand";

// E.164-ish: optional leading +, 8–15 digits.
const E164 = /^\+?[1-9]\d{7,14}$/;

const CreateOnDemandCustomerSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    // Either pick an existing society (society_id) or type a new one (society).
    society_id: z.string().uuid().optional(),
    society: z.string().optional(),
    apartment_number: z.string().min(1, "Apartment number is required"),
    mobile: z
      .string()
      .regex(E164, "Mobile must be a valid phone number")
      .optional()
      .or(z.literal("")),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    source: z.enum(ONDEMAND_SOURCES),
  })
  .refine((v) => !!v.society_id || !!v.society?.trim(), {
    message: "Society is required",
    path: ["society"],
  });

// POST /api/ops/ondemand/customers — create an on-demand customer.
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
  const parsed = CreateOnDemandCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  const supabase = getSupabaseAdmin();

  // Map the on-demand quick-add shape onto the shared customer-create input.
  // society (free text) -> society_name (upsert); apartment -> unit_number.
  const input: CreateCustomerInput = {
    name: d.name,
    phone_number: d.mobile || "",
    email: d.email || undefined,
    // society_id wins; else the typed name is upserted (resolveSocietyId).
    society_id: d.society_id,
    society_name: d.society_id ? undefined : d.society?.trim(),
    unit_number: d.apartment_number,
    customer_type: "ondemand",
    source: d.source,
  };

  const result = await createDraftCustomer(supabase, input, auth.userId, "ACTIVE");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "customer.created",
    targetTable: "customers",
    targetId: result.customer.id,
    metadata: { customer_type: "ondemand", source: d.source },
    ip,
    userAgent,
  });

  return NextResponse.json({ data: result.customer }, { status: 201 });
}
