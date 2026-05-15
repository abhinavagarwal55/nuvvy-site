import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";

export const runtime = "nodejs";

const BUCKET = "catalog-product-images";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const FETCH_TIMEOUT_MS = 5000;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function fetchRemoteImage(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Remote image fetch failed: ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) {
      throw new Error(`Remote URL is not an image (content-type: ${ct})`);
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_SIZE_BYTES) {
      throw new Error("Remote image exceeds 5MB cap");
    }
    return Buffer.from(ab);
  } finally {
    clearTimeout(timeout);
  }
}

// POST /api/internal/accessories/[id]/image
// Accepts EITHER multipart file upload OR JSON { remote_url }
export async function POST(
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

  let buffer: Buffer | null = null;
  let mime = "image/jpeg";

  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("image");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No image file provided" }, { status: 400 });
      }
      if (!ALLOWED_MIME.includes(file.type)) {
        return NextResponse.json(
          { error: "Image must be JPG, PNG, or WebP" },
          { status: 400 }
        );
      }
      if (file.size > MAX_SIZE_BYTES) {
        return NextResponse.json({ error: "Image must be ≤ 5MB" }, { status: 400 });
      }
      mime = file.type;
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await request.json().catch(() => null);
      const remoteUrl = body?.remote_url;
      if (typeof remoteUrl !== "string" || !remoteUrl.startsWith("http")) {
        return NextResponse.json(
          { error: "Provide an image file or a remote_url string" },
          { status: 400 }
        );
      }
      buffer = await fetchRemoteImage(remoteUrl);
      // The content-type check happens inside fetchRemoteImage; default to jpg
      // (UI/preview won't care; storage public URL will serve raw bytes).
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Image fetch failed" },
      { status: 400 }
    );
  }

  if (!buffer) {
    return NextResponse.json({ error: "No image data" }, { status: 400 });
  }

  const ext = extFromMime(mime);
  const path = `${id}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  // No separate thumbnail processing in V1 — store the same URL in both
  // image_storage_url and thumbnail_storage_url (same pattern as plants).
  const { data: updated, error: updErr } = await supabase
    .from("catalog_products")
    .update({
      image_storage_url: pub.publicUrl,
      thumbnail_storage_url: pub.publicUrl,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .select()
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "catalog_product.image_uploaded",
    targetTable: "catalog_products",
    targetId: id,
    metadata: { storage_path: path },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: updated });
}
