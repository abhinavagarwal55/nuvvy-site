import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

export const maxDuration = 30;

const MAX_UPLOAD = 10 * 1024 * 1024; // 10MB hard limit for raw upload
const OPS_BUCKET = "nuvvy-ops";

// POST /api/ops/expenses/receipt — admin or horti.
// Uploads a receipt image, returns its relative storage path. The client
// then includes `receipt_path` in the create/update body. Mirrors the
// service/customer photo upload flow; relative paths only (never full URLs).
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

  const formData = await request.formData();
  const file = formData.get("receipt") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No receipt provided" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD) {
    return NextResponse.json(
      { error: "Receipt must be under 10MB" },
      { status: 400 }
    );
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // Try server-side compression; fall back to raw upload if unavailable.
  let uploadBuffer: Buffer = rawBuffer;
  let uploadContentType = file.type || "image/jpeg";
  try {
    const { compressImageServer } = await import(
      "@/lib/utils/compress-image-server"
    );
    const result = await compressImageServer(rawBuffer);
    uploadBuffer = Buffer.from(result.buffer);
    uploadContentType = result.contentType;
  } catch {
    // Compression failed — upload the raw file (client should have compressed it).
  }

  const expenseUuid = crypto.randomUUID();
  const fileUuid = crypto.randomUUID();
  const ext =
    uploadContentType === "image/jpeg"
      ? "jpg"
      : file.name.split(".").pop() || "jpg";
  const storagePath = `expenses/${expenseUuid}/receipt/${fileUuid}.${ext}`;

  const supabase = getSupabaseAdmin();
  const { error: uploadErr } = await supabase.storage
    .from(OPS_BUCKET)
    .upload(storagePath, uploadBuffer, {
      contentType: uploadContentType,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: { path: storagePath } }, { status: 201 });
}
