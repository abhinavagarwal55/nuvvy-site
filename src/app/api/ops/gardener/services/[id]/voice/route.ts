import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// POST /api/ops/gardener/services/[id]/voice — upload voice note
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

  const { data: service } = await supabase
    .from("service_visits")
    .select("id, assigned_gardener_id, status")
    .eq("id", id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (auth.role === "gardener" && service.assigned_gardener_id !== auth.gardener_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (service.status !== "in_progress") {
    return NextResponse.json(
      { error: "Service must be in progress" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("voice") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No voice file provided" }, { status: 400 });
  }

  const uuid = crypto.randomUUID();
  // Detect proper extension from content type
  const contentType = file.type || "audio/webm";
  let ext = "webm";
  if (contentType.includes("mp4") || contentType.includes("m4a")) ext = "m4a";
  else if (contentType.includes("ogg")) ext = "ogg";
  else if (contentType.includes("wav")) ext = "wav";
  const storagePath = `services/${id}/voice/${uuid}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from("nuvvy-ops")
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // One voice note per service (upsert by deleting existing)
  await supabase.from("service_voice_notes").delete().eq("service_id", id);

  const { data, error: insertErr } = await supabase
    .from("service_voice_notes")
    .insert({ service_id: id, storage_path: storagePath })
    .select("id, storage_path")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
