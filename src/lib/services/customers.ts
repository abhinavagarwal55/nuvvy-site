import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { customerTypeSchema } from "@/lib/schemas/customer-type";

/**
 * Shared customer-create logic. The source of truth for the customer-create
 * payload + draft-customer insertion, used by:
 *   - POST /api/ops/customers          (manual onboarding wizard)
 *   - POST /api/ops/leads/[id]/convert (lead → customer conversion)
 *
 * Keep this in sync with the onboarding wizard fields. Do not duplicate the
 * insert logic — both callers must produce identical customer rows.
 */
export const createCustomerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone_number: z.string().min(1, "Phone number is required"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  unit_number: z.string().optional(),
  society_id: z.string().uuid().optional(),
  society_name: z.string().optional(), // for creating a new society inline
  plant_count_range: z.enum(["0_20", "20_40", "40_plus"]).optional(),
  light_condition: z.string().optional(),
  watering_responsibility: z.array(z.string()).optional(),
  house_help_phone: z.string().optional(),
  garden_notes: z.string().optional(),
  // care_plan is the superset (and the historical default). Set once at create;
  // changed only via the audited POST /api/ops/customers/[id]/change-type.
  customer_type: customerTypeSchema.default("care_plan"),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export type CreateDraftCustomerResult =
  | { ok: true; customer: Record<string, unknown> & { id: string } }
  | { ok: false; error: string; status: number };

/**
 * Insert a DRAFT customer (resolving / upserting the society first when only a
 * society_name was provided). Returns a discriminated result so callers can
 * map failures to the right HTTP status without throwing.
 */
export async function createDraftCustomer(
  supabase: SupabaseClient,
  input: CreateCustomerInput,
  createdBy: string | null
): Promise<CreateDraftCustomerResult> {
  // Resolve society: explicit id wins, else upsert by name when provided.
  let societyId = input.society_id ?? null;
  if (!societyId && input.society_name) {
    const { data: existing } = await supabase
      .from("societies")
      .select("id")
      .eq("name", input.society_name)
      .maybeSingle();

    if (existing) {
      societyId = existing.id;
    } else {
      const { data: newSociety, error: socErr } = await supabase
        .from("societies")
        .insert({ name: input.society_name })
        .select("id")
        .single();
      if (socErr) return { ok: false, error: socErr.message, status: 500 };
      societyId = newSociety.id;
    }
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: input.name,
      phone_number: input.phone_number,
      email: input.email || null,
      address: input.address ?? null,
      unit_number: input.unit_number ?? null,
      status: "DRAFT",
      society_id: societyId,
      plant_count_range: input.plant_count_range ?? null,
      light_condition: input.light_condition ?? null,
      watering_responsibility: input.watering_responsibility ?? null,
      house_help_phone: input.house_help_phone ?? null,
      garden_notes: input.garden_notes ?? null,
      customer_type: input.customer_type,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, customer: data as Record<string, unknown> & { id: string } };
}
