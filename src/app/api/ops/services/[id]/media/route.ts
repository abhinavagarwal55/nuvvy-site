import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { getSignedUrl } from "@/lib/supabase/storage";

// GET /api/ops/services/[id]/media — returns photos (signed URLs) + voice note (signed URL)
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

  const [{ data: photos }, { data: voiceNotes }] = await Promise.all([
    supabase
      .from("visit_photos")
      .select("id, storage_path, tag, caption, uploaded_at")
      .eq("visit_id", id)
      .order("uploaded_at"),
    supabase
      .from("service_voice_notes")
      .select("id, storage_path, uploaded_at")
      .eq("service_id", id),
  ]);

  // Generate signed URLs
  const photosWithUrls = await Promise.all(
    (photos ?? []).map(async (p) => ({
      ...p,
      signed_url: await getSignedUrl("nuvvy-ops", p.storage_path),
    }))
  );

  let voiceNote = null;
  if (voiceNotes && voiceNotes.length > 0) {
    const vn = voiceNotes[0];
    voiceNote = {
      ...vn,
      signed_url: await getSignedUrl("nuvvy-ops", vn.storage_path),
    };
  }

  return NextResponse.json({
    data: {
      photos: photosWithUrls,
      voice_note: voiceNote,
    },
  });
}
