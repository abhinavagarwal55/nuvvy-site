import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";
import {
  catalogProductCreateSchema,
  type CatalogProduct,
} from "@/lib/catalog/catalogProductTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/internal/accessories
// Query params:
//   status   default 'active,draft'  comma-separated allow-list
//   category single category
//   source   single source
//   q        free-text on name/brand/asin
//   sort     default 'updated_at_desc'  one of name|updated_at|price (with _asc|_desc)
//   limit    default 50, max 200
//   offset   default 0
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }
  void auth;

  const sp = request.nextUrl.searchParams;
  const statusParam = sp.get("status") ?? "active,draft";
  const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean);
  const category = sp.get("category");
  const source = sp.get("source");
  const q = sp.get("q")?.trim();
  const sortRaw = sp.get("sort") ?? "updated_at_desc";
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("catalog_products")
    .select("*", { count: "exact" });

  if (statuses.length > 0) query = query.in("status", statuses);
  if (category) query = query.eq("category", category);
  if (source) query = query.eq("source", source);
  if (q) {
    const term = q.replace(/[%]/g, "");
    query = query.or(
      `name.ilike.%${term}%,brand.ilike.%${term}%,amazon_asin.ilike.%${term}%`
    );
  }

  // Sort
  const [sortColRaw, sortDirRaw] = sortRaw.split("_");
  const allowedSort = new Set(["name", "updated_at", "price"]);
  const col =
    sortColRaw === "price"
      ? "price_inr"
      : allowedSort.has(sortColRaw)
        ? sortColRaw
        : "updated_at";
  const asc = sortDirRaw === "asc";
  query = query.order(col, { ascending: asc, nullsFirst: false });

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}

// POST /api/internal/accessories  — create
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = catalogProductCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const supabase = getSupabaseAdmin();

  // Duplicate ASIN guard — surface a friendly conflict with existing id
  if (input.amazon_asin && (input.source ?? "amazon_affiliate") === "amazon_affiliate") {
    const { data: existing } = await supabase
      .from("catalog_products")
      .select("id, status")
      .eq("amazon_asin", input.amazon_asin)
      .eq("source", "amazon_affiliate")
      .neq("status", "inactive")
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        {
          error: "An accessory with this ASIN already exists",
          existing_id: existing.id,
        },
        { status: 409 }
      );
    }
  }

  const insertRow = {
    name: input.name,
    description: input.description ?? null,
    category: input.category,
    source: input.source ?? "amazon_affiliate",
    amazon_asin: input.amazon_asin ?? null,
    amazon_url: input.amazon_url ?? null,
    price_inr: input.price_inr ?? null,
    price_snapshot_at: input.price_snapshot_at ?? null,
    image_url: input.image_url ?? null,
    image_storage_url: input.image_storage_url ?? null,
    thumbnail_url: input.thumbnail_url ?? null,
    thumbnail_storage_url: input.thumbnail_storage_url ?? null,
    brand: input.brand ?? null,
    attributes: input.attributes ?? {},
    display_order: input.display_order ?? null,
    notes_internal: input.notes_internal ?? null,
    // Default new accessories to Active so they appear on the public
    // catalog immediately. Use the edit-page status control to demote to
    // Draft / Unavailable / Inactive if needed.
    status: "active" as const,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { data, error } = await supabase
    .from("catalog_products")
    .insert(insertRow)
    .select()
    .single<CatalogProduct>();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "An accessory with this ASIN already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "catalog_product.created",
    targetTable: "catalog_products",
    targetId: data.id,
    metadata: {
      name: data.name,
      category: data.category,
      amazon_asin: data.amazon_asin,
    },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data }, { status: 201 });
}
