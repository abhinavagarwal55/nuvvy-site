import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Create Supabase client with service role
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST /api/internal/shortlists/[id]/duplicate
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { data: null, error: "Shortlist ID is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Fetch original shortlist
    const { data: original, error: fetchError } = await supabase
      .from("shortlists")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !original) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }

    // Create duplicate shortlist
    const { data: duplicate, error: createError } = await supabase
      .from("shortlists")
      .insert({
        customer_id: original.customer_id,
        customer_uuid: original.customer_uuid,
        title: original.title ? `Copy of ${original.title}` : "Copy of Shortlist",
        description: original.description,
        status: "DRAFT",
        current_version_number: 0,
      })
      .select()
      .single();

    if (createError || !duplicate) {
      console.error("Error creating duplicate shortlist:", createError);
      return NextResponse.json(
        { data: null, error: createError?.message || "Failed to duplicate shortlist" },
        { status: 500 }
      );
    }

    // Determine which items to copy based on shortlist status
    let originalItems: any[] = [];

    if (original.status === "CUSTOMER_SUBMITTED" || original.status === "SENT_TO_CUSTOMER") {
      // For submitted/sent shortlists, copy from version items
      // Prioritize CUSTOMER_SUBMITTED version, fallback to SENT_TO_CUSTOMER
      let versionToCopy = null;
      
      // Try CUSTOMER_SUBMITTED first
      const { data: submittedVersion } = await supabase
        .from("shortlist_versions")
        .select("id")
        .eq("shortlist_id", id)
        .eq("status_at_time", "CUSTOMER_SUBMITTED")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (submittedVersion) {
        versionToCopy = submittedVersion;
      } else {
        // Fallback to SENT_TO_CUSTOMER
        const { data: sentVersion } = await supabase
          .from("shortlist_versions")
          .select("id")
          .eq("shortlist_id", id)
          .eq("status_at_time", "SENT_TO_CUSTOMER")
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (sentVersion) {
          versionToCopy = sentVersion;
        }
      }

      if (versionToCopy) {
        const { data: versionItems, error: versionItemsError } = await supabase
          .from("shortlist_version_items")
          .select("plant_id, quantity, note, why_picked_for_balcony")
          .eq("shortlist_version_id", versionToCopy.id);

        if (!versionItemsError && versionItems) {
          originalItems = versionItems;
        }
      }
    } else {
      // For draft shortlists, copy from draft items
      const { data: draftItems, error: itemsError } = await supabase
        .from("shortlist_draft_items")
        .select("plant_id, quantity, note, why_picked_for_balcony")
        .eq("shortlist_id", id);

      if (!itemsError && draftItems) {
        originalItems = draftItems;
      }
    }

    // Duplicate items if they exist
    if (originalItems && originalItems.length > 0) {
      const duplicateItems = originalItems.map((item: any) => ({
        shortlist_id: duplicate.id,
        plant_id: item.plant_id,
        quantity: item.quantity || null,
        note: item.note || null,
        why_picked_for_balcony: item.why_picked_for_balcony || null,
      }));

      const { error: insertItemsError } = await supabase
        .from("shortlist_draft_items")
        .insert(duplicateItems);

      if (insertItemsError) {
        console.error("Error duplicating items:", insertItemsError);
        // Continue - shortlist is created even if items fail
      }
    }

    return NextResponse.json({
      data: duplicate,
      error: null,
    });
  } catch (err) {
    console.error("Error in POST /api/internal/shortlists/[id]/duplicate - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
