import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

export const maxDuration = 30; // Allow up to 30s for HEIC conversion + upload

const MAX_UPLOAD = 10 * 1024 * 1024; // 10MB hard limit for raw upload

// POST /api/ops/gardener/services/[id]/photos — upload photo
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

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Verify service exists
  const { data: service } = await supabase
    .from("service_visits")
    .select("id, customer_id, assigned_gardener_id, status")
    .eq("id", id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (auth.role === "gardener" && service.assigned_gardener_id !== auth.gardener_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["in_progress", "scheduled"].includes(service.status)) {
    return NextResponse.json(
      { error: "Service must be in progress to upload photos" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("photo") as File | null;
  const tag = (formData.get("tag") as string) || "general";
  const caption = (formData.get("caption") as string) || null;

  if (!file) {
    return NextResponse.json({ error: "No photo file provided" }, { status: 400 });
  }

  // Enforce max 10 general (wide-shot) photos per service
  if (tag === "general") {
    const { count } = await supabase
      .from("visit_photos")
      .select("id", { count: "exact", head: true })
      .eq("visit_id", id)
      .eq("tag", "general");
    if ((count ?? 0) >= 10) {
      return NextResponse.json(
        { error: "Maximum 10 photos allowed" },
        { status: 400 }
      );
    }
  }

  if (file.size > MAX_UPLOAD) {
    return NextResponse.json(
      { error: "Photo must be under 10MB" },
      { status: 400 }
    );
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  let uploadBuffer: Buffer = rawBuffer;
  let uploadContentType = file.type || "image/jpeg";
  try {
    const { compressImageServer } = await import("@/lib/utils/compress-image-server");
    const result = await compressImageServer(rawBuffer);
    uploadBuffer = Buffer.from(result.buffer);
    uploadContentType = result.contentType;
  } catch {
    // Compression failed — upload the raw file
  }

  const uuid = crypto.randomUUID();
  const ext = uploadContentType === "image/jpeg" ? "jpg" : file.name.split(".").pop() || "jpg";
  const storagePath = `services/${id}/photos/${uuid}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("nuvvy-ops")
    .upload(storagePath, uploadBuffer, {
      contentType: uploadContentType,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: photo, error: insertErr } = await supabase
    .from("visit_photos")
    .insert({
      visit_id: id,
      customer_id: service.customer_id,
      storage_path: storagePath,
      tag,
      caption,
    })
    .select("id, storage_path, tag")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: photo }, { status: 201 });
}

// DELETE /api/ops/gardener/services/[id]/photos?photo_id=xxx — delete a photo
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

  const { id } = await params;
  const photoId = new URL(request.url).searchParams.get("photo_id");
  if (!photoId) {
    return NextResponse.json({ error: "photo_id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: photo } = await supabase
    .from("visit_photos")
    .select("id, storage_path, visit_id")
    .eq("id", photoId)
    .eq("visit_id", id)
    .single();

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  // Gardeners can only delete photos from their own services
  if (auth.role === "gardener") {
    const { data: service } = await supabase
      .from("service_visits")
      .select("assigned_gardener_id")
      .eq("id", id)
      .single();
    if (service?.assigned_gardener_id !== auth.gardener_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await supabase.storage.from("nuvvy-ops").remove([photo.storage_path]);
  await supabase.from("visit_photos").delete().eq("id", photoId);

  return NextResponse.json({ data: { ok: true } });
}
