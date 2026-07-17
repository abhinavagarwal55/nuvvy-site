import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createShortlistWithItems } from "@/lib/services/shortlists";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Create Supabase client with service role
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/internal/shortlists
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    
    // Fetch all shortlists with customer info and public links, ordered by updated_at DESC
    const { data: shortlists, error: shortlistsError } = await supabase
      .from("shortlists")
      .select(`
        id,
        title,
        description,
        status,
        customer_id,
        current_version_number,
        created_at,
        updated_at,
        customer:customers (
          id,
          name
        ),
        shortlist_public_links (
          id,
          token_hash,
          active
        )
      `)
      .order("updated_at", { ascending: false });
    
    if (shortlistsError) {
      console.error("Error fetching shortlists:", shortlistsError);
      return NextResponse.json(
        { data: null, error: shortlistsError.message || "Failed to fetch shortlists" },
        { status: 500 }
      );
    }
    
    // Transform data to include customer name, public link status, unsent changes, and version metadata
    const transformed = await Promise.all((shortlists || []).map(async (shortlist: any) => {
      // Check if active public link exists
      const hasActiveLink = shortlist.shortlist_public_links?.some(
        (link: any) => link.active === true
      );
      
      // Get latest version metadata (including status_at_time to derive current status)
      const { data: latestVersion } = await supabase
        .from("shortlist_versions")
        .select("version_number, created_at, status_at_time")
        .eq("shortlist_id", shortlist.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const latestSentVersionNumber = latestVersion?.version_number || 0;
      const latestSentAt = latestVersion?.created_at || null;
      
      // Derive status from latest version if it's CUSTOMER_SUBMITTED
      // This handles cases where the parent shortlist.status wasn't updated (old data)
      // BUT: TO_BE_PROCURED status on the shortlist takes precedence (it's a terminal state)
      let derivedStatus = shortlist.status;
      if (shortlist.status === "TO_BE_PROCURED") {
        // TO_BE_PROCURED is terminal - always use it
        derivedStatus = "TO_BE_PROCURED";
      } else if (latestVersion?.status_at_time === "CUSTOMER_SUBMITTED") {
        derivedStatus = "CUSTOMER_SUBMITTED";
      }
      
      // Check for unsent changes using version number comparison
      // hasUnsentChanges = current_version_number > latest_sent_version_number
      const currentVersionNumber = shortlist.current_version_number || 0;
      let hasUnsentChanges = false;
      if (derivedStatus === "SENT_TO_CUSTOMER") {
        hasUnsentChanges = currentVersionNumber > latestSentVersionNumber;
      }
      
      return {
        id: shortlist.id,
        title: shortlist.title,
        description: shortlist.description,
        status: derivedStatus,
        customer_id: shortlist.customer_id,
        customer_name: shortlist.customer?.name || "Unknown Customer",
        created_at: shortlist.created_at,
        updated_at: shortlist.updated_at,
        current_version_number: shortlist.current_version_number || 0,
        latest_sent_version_number: latestSentVersionNumber,
        latest_sent_at: latestSentAt,
        public_url: null, // Public URL is only available from publish endpoint
        has_public_link: hasActiveLink || false,
        has_unsent_changes: hasUnsentChanges,
      };
    }));
    
    return NextResponse.json({
      data: transformed,
      error: null,
    });
  } catch (err) {
    console.error("Error in GET /api/internal/shortlists:", err);
    return NextResponse.json(
      { data: null, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/internal/shortlists
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_uuid, title, description, status, items } = body;

    // Legacy CMS create: status MUST be DRAFT and the customer must be ACTIVE.
    // Both invariants are preserved — createShortlistWithItems enforces the
    // ACTIVE-customer rule via requireActiveCustomer; the DRAFT check stays here.
    if (!status || status !== "DRAFT") {
      return NextResponse.json({ error: "Status must be DRAFT" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const result = await createShortlistWithItems(supabase, {
      customerId: customer_uuid,
      title,
      description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: Array.isArray(items) ? items.map((i: any) => ({ plant_id: i.plant_id })) : [],
      requireActiveCustomer: true,
    });

    if (!result.ok) {
      const msg =
        result.error === "Customer is required" ? "Customer UUID is required" : result.error;
      return NextResponse.json({ error: msg }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err) {
    console.error("Error in POST /api/internal/shortlists:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
