import { NextRequest, NextResponse } from "next/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/people/me/role — returns the authenticated user's role
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  return NextResponse.json({ data: { role: auth.role } });
}
