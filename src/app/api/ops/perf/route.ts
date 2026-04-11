import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const BeaconSchema = z.object({
  route: z.string().min(1),
  method: z.string().min(1),
  status_code: z.number().int(),
  total_user_ms: z.number(),
  ttfb_ms: z.number().nullable(),
  transfer_ms: z.number().nullable(),
  render_ms: z.number().nullable(),
  page: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

// POST /api/ops/perf — client-side timing beacon (no auth required)
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BeaconSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const supabase = getSupabaseAdmin();

  // Fire-and-forget insert
  Promise.resolve()
    .then(() =>
      supabase.from("perf_logs").insert({
        source: "client",
        route: d.route,
        method: d.method,
        status_code: d.status_code,
        total_ms: d.total_user_ms,
        ttfb_ms: d.ttfb_ms,
        transfer_ms: d.transfer_ms,
        render_ms: d.render_ms,
        total_user_ms: d.total_user_ms,
        page: d.page,
        metadata: d.metadata ?? null,
      })
    )
    .catch((err: unknown) => console.error("perf beacon insert failed:", err));

  return NextResponse.json({ ok: true });
}
