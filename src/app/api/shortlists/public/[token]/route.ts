import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/shortlists/public/[token]
// Returns the version to display for a customer-facing shortlist page
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Create Supabase admin client with proper error handling
    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (err) {
      console.error("Failed to initialize Supabase client:", err);
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please contact Nuvvy." },
        { status: 503 }
      );
    }

    // Step 1: Validate token - hash the token and find matching public link
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { data: publicLink, error: linkError } = await supabase
      .from("shortlist_public_links")
      .select("shortlist_id")
      .eq("token_hash", tokenHash)
      .eq("active", true)
      .maybeSingle();

    if (linkError) {
      console.error("Error fetching public link:", linkError);
      return NextResponse.json(
        { error: "Failed to validate token" },
        { status: 500 }
      );
    }

    if (!publicLink) {
      return NextResponse.json(
        { error: "Shortlist not found" },
        { status: 404 }
      );
    }

    const shortlistId = publicLink.shortlist_id;

    // Step 2: Fetch shortlist metadata (title, description) and customer name
    const { data: shortlistData, error: shortlistError } = await supabase
      .from("shortlists")
      .select(`
        id,
        title,
        description,
        customer:customers!fk_shortlists_customer (
          name
        )
      `)
      .eq("id", shortlistId)
      .maybeSingle();

    if (shortlistError) {
      console.error("Error fetching shortlist metadata:", shortlistError);
      // Don't fail the request if metadata fetch fails, just log it
    }

    // Extract customer name (handle nested structure from Supabase join)
    // Supabase returns foreign key relationships as objects (one-to-one) or arrays (one-to-many)
    let customerName: string | null = null;
    if (shortlistData?.customer) {
      const customer = shortlistData.customer as any;
      if (Array.isArray(customer)) {
        customerName = customer[0]?.name || null;
      } else if (customer && typeof customer === 'object' && 'name' in customer) {
        customerName = customer.name || null;
      }
    }

    // Step 3: Find the version to display using version selection logic
    // Prefer latest CUSTOMER_SUBMITTED (final submitted state), fallback to latest SENT_TO_CUSTOMER (editable state)
    // NEVER load DRAFT, TO_BE_PROCURED, or other internal-only statuses
    
    // First, try to find latest CUSTOMER_SUBMITTED version (customer's final submission)
    const { data: submittedVersion, error: submittedVersionError } = await supabase
      .from("shortlist_versions")
      .select("id, version_number, status_at_time, created_at")
      .eq("shortlist_id", shortlistId)
      .eq("status_at_time", "CUSTOMER_SUBMITTED")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (submittedVersionError) {
      console.error("Error fetching submitted version:", submittedVersionError);
      return NextResponse.json(
        { error: "Failed to find version" },
        { status: 500 }
      );
    }

    let versionToLoad = submittedVersion;

    // Fallback: if no CUSTOMER_SUBMITTED version, try SENT_TO_CUSTOMER (editable state)
    if (!versionToLoad) {
      const { data: sentVersion, error: sentVersionError } = await supabase
        .from("shortlist_versions")
        .select("id, version_number, status_at_time, created_at")
        .eq("shortlist_id", shortlistId)
        .eq("status_at_time", "SENT_TO_CUSTOMER")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sentVersionError) {
        console.error("Error fetching sent version:", sentVersionError);
        return NextResponse.json(
          { error: "Failed to find version" },
          { status: 500 }
        );
      }

      versionToLoad = sentVersion;
    }

    if (!versionToLoad) {
      return NextResponse.json(
        { error: "No viewable version found" },
        { status: 404 }
      );
    }

    // Step 4: Fetch version items with plant + catalog_product joins
    // (WS-B polymorphic items — `type` discriminator added below).
    const { data: versionItems, error: itemsError } = await supabase
      .from("shortlist_version_items")
      .select(`
        id,
        plant_id,
        catalog_product_id,
        section_id,
        quantity,
        note,
        why_picked_for_balcony,
        created_at,
        plant:plants (
          id,
          name,
          scientific_name,
          price_band,
          light,
          watering_requirement,
          thumbnail_url,
          thumbnail_storage_url,
          image_url,
          image_storage_url
        ),
        catalog_product:catalog_products (
          id,
          name,
          brand,
          category,
          price_inr,
          price_snapshot_at,
          status,
          amazon_asin,
          amazon_url,
          thumbnail_url,
          thumbnail_storage_url,
          image_url,
          image_storage_url
        )
      `)
      .eq("shortlist_version_id", versionToLoad.id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      console.error("Error fetching version items:", itemsError);
      return NextResponse.json(
        { error: itemsError.message || "Failed to fetch version items" },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (versionItems || []).map((item: any) => ({
      id: item.id,
      type: item.catalog_product_id ? "accessory" : "plant",
      plant_id: item.plant_id,
      catalog_product_id: item.catalog_product_id,
      section_id: item.section_id,
      quantity: item.quantity,
      note: item.note,
      why_picked_for_balcony: item.why_picked_for_balcony,
      plant: item.plant,
      catalog_product: item.catalog_product,
    }));

    // Group PLANT items by their snapshotted section (ordered). Accessories are
    // section-less and stay in the flat `items` list (rendered separately).
    const { data: versionSections } = await supabase
      .from("shortlist_version_sections")
      .select("id, name, sort_order")
      .eq("shortlist_version_id", versionToLoad.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const plantItems = items.filter((i: any) => i.type === "plant");
    const sections = (versionSections ?? []).map((s: any) => ({
      id: s.id as string,
      name: s.name as string,
      sort_order: s.sort_order as number,
      items: plantItems.filter((i: any) => i.section_id === s.id),
    }));
    // Defensive: if a version predates sections (shouldn't after backfill) OR
    // some plants have no section, park the orphans in a single default section
    // so the customer page never drops items.
    const orphanPlants = plantItems.filter((i: any) => !sections.some((s) => s.items.includes(i)));
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (sections.length === 0 && plantItems.length > 0) {
      sections.push({ id: "default", name: "Plants", sort_order: 0, items: plantItems });
    } else if (orphanPlants.length > 0 && sections.length > 0) {
      sections[0].items = [...sections[0].items, ...orphanPlants];
    }

    return NextResponse.json({
      version: {
        id: versionToLoad.id,
        version_number: versionToLoad.version_number,
        status_at_time: versionToLoad.status_at_time,
        created_at: versionToLoad.created_at,
      },
      items,
      sections,
      customer_name: customerName || null,
      shortlist_title: shortlistData?.title || null,
      shortlist_description: shortlistData?.description || null,
    });
  } catch (err) {
    console.error("Error in GET /api/shortlists/public/[token]:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
