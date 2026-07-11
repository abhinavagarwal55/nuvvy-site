import { NextRequest, NextResponse } from "next/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/whoami — the authenticated user's role. Used by client settings
// pages to gate structural controls (server routes still enforce the real check).
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  return NextResponse.json({ data: { role: auth.role } });
}
