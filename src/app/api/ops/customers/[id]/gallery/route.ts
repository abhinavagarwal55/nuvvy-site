import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { getSignedUrls } from "@/lib/supabase/storage";

const BUCKET = "nuvvy-ops";

type GalleryPhoto = {
  id: string;
  source: "onboarding" | "visit";
  storage_path: string;
  url: string | null;
  // ISO timestamp used for sorting + display (newest first).
  taken_at: string;
  caption: string | null;
  tag: string | null;
  // Present only for visit photos — lets the UI deep-link to the service.
  visit_id: string | null;
  visit_date: string | null;
};

// GET /api/ops/customers/[id]/gallery
// Read-only aggregate of ALL photos for a customer: onboarding baseline
// (customer_photos) + every visit photo (visit_photos). Returned newest-first
// with batched signed URLs. Admin + horticulturist only.
//
// NOTE: intentionally separate from /photos (which backs the onboarding
// upload/delete flow, capped at 3). This route never writes.
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

  // TODO: paginate — V1 returns every photo for the customer in a single
  // response. A customer with years of weekly visits could accumulate hundreds
  // of visit photos; revisit with keyset pagination if payload size becomes a
  // problem.
  const [onboardingRes, visitRes] = await Promise.all([
    supabase
      .from("customer_photos")
      .select("id, storage_path, uploaded_at")
      .eq("customer_id", id)
      .eq("is_onboarding_photo", true),
    supabase
      .from("visit_photos")
      .select("id, storage_path, caption, tag, taken_at, uploaded_at, visit_id, service_visits(scheduled_date)")
      .eq("customer_id", id),
  ]);

  if (onboardingRes.error) {
    return NextResponse.json({ error: onboardingRes.error.message }, { status: 500 });
  }
  if (visitRes.error) {
    return NextResponse.json({ error: visitRes.error.message }, { status: 500 });
  }

  // Collect every storage path and resolve signed URLs in ONE batch call per
  // bucket rather than N sequential round-trips.
  const allPaths = [
    ...(onboardingRes.data ?? []).map((p) => p.storage_path),
    ...(visitRes.data ?? []).map((p) => p.storage_path),
  ];
  const urlMap = await getSignedUrls(BUCKET, allPaths);

  const onboarding: GalleryPhoto[] = (onboardingRes.data ?? []).map((p) => ({
    id: p.id,
    source: "onboarding",
    storage_path: p.storage_path,
    url: urlMap[p.storage_path] ?? null,
    taken_at: p.uploaded_at,
    caption: null,
    tag: null,
    visit_id: null,
    visit_date: null,
  }));

  const visit: GalleryPhoto[] = (visitRes.data ?? []).map((p) => {
    // service_visits embed is to-one; supabase-js may type it as array.
    const sv = Array.isArray(p.service_visits) ? p.service_visits[0] : p.service_visits;
    const visitDate = (sv as { scheduled_date?: string } | null)?.scheduled_date ?? null;
    return {
      id: p.id,
      source: "visit" as const,
      storage_path: p.storage_path,
      url: urlMap[p.storage_path] ?? null,
      // Prefer when the photo was taken; fall back to upload time, then visit date.
      taken_at: p.taken_at ?? p.uploaded_at ?? visitDate ?? new Date(0).toISOString(),
      caption: p.caption ?? null,
      tag: p.tag ?? null,
      visit_id: p.visit_id,
      visit_date: visitDate,
    };
  });

  const photos = [...onboarding, ...visit].sort(
    (a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime()
  );

  return NextResponse.json({ data: photos });
}
