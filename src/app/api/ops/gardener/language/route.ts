import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE } from "@/lib/i18n/cookie";

// POST /api/ops/gardener/language — the authenticated gardener sets their own
// preferred language. Updates gardeners.preferred_language (source of truth) and
// mirrors it into the nuvvy_lang cookie. Idempotent. PRD §3.3.
const BodySchema = z.object({ language: z.enum(["en", "hi", "kn"]) });

export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  // A gardener can only change their own preference. Admin/horti aren't gardeners
  // and have no row to update — reject rather than silently no-op.
  if (auth.role !== "gardener" || !auth.gardener_id) {
    return NextResponse.json({ error: "Gardener only" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const language = parsed.data.language;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("gardeners")
    .update({ preferred_language: language })
    .eq("id", auth.gardener_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "gardener.language_changed",
    targetTable: "gardeners",
    targetId: auth.gardener_id,
    metadata: { language },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  const res = NextResponse.json({ data: { language } });
  res.cookies.set(LANG_COOKIE, language, {
    path: "/",
    maxAge: LANG_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  return res;
}
