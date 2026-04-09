import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

export const maxDuration = 30; // Allow up to 30s for HEIC conversion + upload

const MAX_UPLOAD = 10 * 1024 * 1024; // 10MB hard limit for raw upload

// GET /api/ops/customers/[id]/photos — list onboarding photos
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
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("customer_photos")
    .select("id, storage_path, is_onboarding_photo, uploaded_at")
    .eq("customer_id", id)
    .order("uploaded_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate signed URLs for each photo
  const photos = await Promise.all(
    (data ?? []).map(async (p) => {
      const { data: urlData } = await supabase.storage
        .from("nuvvy-ops")
        .createSignedUrl(p.storage_path, 3600); // 1 hour
      return { ...p, url: urlData?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ data: photos });
}

// POST /api/ops/customers/[id]/photos — upload onboarding photo
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
  const formData = await request.formData();
  const file = formData.get("photo") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD) {
    return NextResponse.json(
      { error: "Photo must be under 10MB" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Check max 3 onboarding photos
  const { count } = await supabase
    .from("customer_photos")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id)
    .eq("is_onboarding_photo", true);

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: "Maximum 3 onboarding photos" },
      { status: 400 }
    );
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // Try server-side compression, but fall back to raw upload if it fails
  // (sharp/heic-convert may not be available on all runtimes)
  let uploadBuffer: Buffer = rawBuffer;
  let uploadContentType = file.type || "image/jpeg";
  try {
    const { compressImageServer } = await import("@/lib/utils/compress-image-server");
    const result = await compressImageServer(rawBuffer);
    uploadBuffer = Buffer.from(result.buffer);
    uploadContentType = result.contentType;
  } catch {
    // Compression failed — upload the raw file (client should have compressed it)
  }

  const uuid = crypto.randomUUID();
  const ext = uploadContentType === "image/jpeg" ? "jpg" : file.name.split(".").pop() || "jpg";
  const storagePath = `customers/${id}/onboarding/${uuid}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("nuvvy-ops")
    .upload(storagePath, uploadBuffer, {
      contentType: uploadContentType,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data, error: insertErr } = await supabase
    .from("customer_photos")
    .insert({
      customer_id: id,
      storage_path: storagePath,
      is_onboarding_photo: true,
      uploaded_by: auth.userId,
    })
    .select("id, storage_path")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

// DELETE /api/ops/customers/[id]/photos?photo_id=xxx — delete a photo
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
  const photoId = new URL(request.url).searchParams.get("photo_id");
  if (!photoId) {
    return NextResponse.json({ error: "photo_id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Find the photo record (verify it belongs to this customer)
  const { data: photo } = await supabase
    .from("customer_photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("customer_id", id)
    .single();

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  // Delete from storage
  await supabase.storage.from("nuvvy-ops").remove([photo.storage_path]);

  // Delete from DB
  await supabase.from("customer_photos").delete().eq("id", photoId);

  return NextResponse.json({ data: { ok: true } });
}
