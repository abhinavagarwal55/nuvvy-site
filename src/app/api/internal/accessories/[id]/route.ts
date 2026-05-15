import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";
import {
  catalogProductUpdateSchema,
  type CatalogProduct,
} from "@/lib/catalog/catalogProductTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchProduct(id: string) {
  const supabase = getSupabaseAdmin();
  return supabase
    .from("catalog_products")
    .select("*")
    .eq("id", id)
    .maybeSingle<CatalogProduct>();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const { data, error } = await fetchProduct(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}

async function applyUpdate(
  request: NextRequest,
  id: string,
  action: "catalog_product.updated" | "catalog_product.status_changed"
) {
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

  const parsed = catalogProductUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await fetchProduct(id);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = { ...parsed.data, updated_by: auth.userId };
  const { data: after, error } = await supabase
    .from("catalog_products")
    .update(updates)
    .eq("id", id)
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

  // For status_changed: only fire when status actually changed
  const effectiveAction =
    action === "catalog_product.status_changed" && before.status === after.status
      ? "catalog_product.updated"
      : action;

  // Build a focused diff (only changed keys)
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
    if ((before as unknown as Record<string, unknown>)[key] !== (after as unknown as Record<string, unknown>)[key]) {
      diff[key as string] = {
        from: (before as unknown as Record<string, unknown>)[key],
        to: (after as unknown as Record<string, unknown>)[key],
      };
    }
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: effectiveAction,
    targetTable: "catalog_products",
    targetId: id,
    metadata: { diff, name: after.name },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: after });
}

// PUT — full update
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return applyUpdate(request, id, "catalog_product.updated");
}

// PATCH — partial update (typically status change)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return applyUpdate(request, id, "catalog_product.status_changed");
}

// DELETE — soft delete (flips status to 'inactive')
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const supabase = getSupabaseAdmin();
  const { data: before } = await fetchProduct(id);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("catalog_products")
    .update({ status: "inactive", updated_by: auth.userId })
    .eq("id", id)
    .select()
    .single<CatalogProduct>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "catalog_product.soft_deleted",
    targetTable: "catalog_products",
    targetId: id,
    metadata: { name: before.name, previous_status: before.status },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data });
}
