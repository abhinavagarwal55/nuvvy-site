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

// GET /api/internal/shortlists/[id]
export async function GET(
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
    
    // Fetch shortlist
    const { data: shortlist, error: shortlistError } = await supabase
      .from("shortlists")
      .select("*")
      .eq("id", id)
      .single();
    
    if (shortlistError || !shortlist) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }
    
    // Fetch customer
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, name, phone_number, address, status")
      .eq("id", shortlist.customer_uuid)
      .single();
    
    if (customerError) {
      console.error("Error fetching customer:", customerError);
    }
    
    // Fetch shortlist items with plant details
    const { data: items, error: itemsError } = await supabase
      .from("shortlist_draft_items")
      .select(`
        id,
        plant_id,
        quantity,
        note,
        why_picked_for_balcony,
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
        )
      `)
      .eq("shortlist_id", id);
    
    if (itemsError) {
      console.error("Error fetching items - full Supabase error:", itemsError);
      return NextResponse.json(
        { 
          data: null, 
          error: itemsError.message || itemsError.details || "Failed to fetch shortlist items" 
        },
        { status: 500 }
      );
    }
    
    // Get latest version metadata (all versions, not just sent)
    const { data: latestVersion } = await supabase
      .from("shortlist_versions")
      .select("version_number, created_at, status_at_time")
      .eq("shortlist_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // Get latest CUSTOMER_SUBMITTED version
    const { data: latestSubmittedVersion } = await supabase
      .from("shortlist_versions")
      .select("id, version_number, created_at")
      .eq("shortlist_id", id)
      .eq("status_at_time", "CUSTOMER_SUBMITTED")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const latestSentVersionNumber = latestVersion?.version_number || 0;
    const currentVersionNumber = shortlist.current_version_number || 0;
    const latestSubmittedVersionNumber = latestSubmittedVersion?.version_number || 0;
    
    // Derive status from latest version if it's CUSTOMER_SUBMITTED
    // This handles cases where the parent shortlist.status wasn't updated (old data)
    let derivedStatus = shortlist.status;
    if (latestVersion?.status_at_time === "CUSTOMER_SUBMITTED") {
      derivedStatus = "CUSTOMER_SUBMITTED";
    }
    
    // Determine which items to show:
    // - If there's a CUSTOMER_SUBMITTED version AND current_version_number <= that version, show CUSTOMER_SUBMITTED items
    // - Otherwise, show draft items (either no submission yet, or there's a newer draft)
    let itemsToReturn = items || [];
    let showingVersionItems = false;
    
    if (latestSubmittedVersion && currentVersionNumber <= latestSubmittedVersionNumber) {
      // Show CUSTOMER_SUBMITTED version items instead of draft items
      const { data: versionItems, error: versionItemsError } = await supabase
        .from("shortlist_version_items")
        .select(`
          id,
          plant_id,
          quantity,
          note,
          why_picked_for_balcony,
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
          )
        `)
        .eq("shortlist_version_id", latestSubmittedVersion.id);
      
      if (!versionItemsError && versionItems) {
        // Transform version items to match draft items format
        itemsToReturn = versionItems.map((item: any) => ({
          id: item.id,
          plant_id: item.plant_id,
          quantity: item.quantity,
          note: item.note,
          why_picked_for_balcony: item.why_picked_for_balcony,
          plant: item.plant,
        }));
        showingVersionItems = true;
      }
    }
    
    // Check for unsent changes using version number comparison
    // hasUnsentChanges = current_version_number > latest_sent_version_number
    let hasUnsentChanges = false;
    if (shortlist.status === "SENT_TO_CUSTOMER") {
      hasUnsentChanges = currentVersionNumber > latestSentVersionNumber;
    }
    
    return NextResponse.json({
      data: {
        shortlist: {
          ...shortlist,
          status: derivedStatus, // Use derived status instead of raw database status
        },
        customer: customer || null,
        items: itemsToReturn,
        has_unsent_changes: hasUnsentChanges,
        latest_sent_version_number: latestSentVersionNumber,
        latest_submitted_version_number: latestSubmittedVersionNumber,
        current_version_number: currentVersionNumber,
        showing_version_items: showingVersionItems,
      },
      error: null,
    });
  } catch (err) {
    console.error("Error in GET /api/internal/shortlists/[id] - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}

// PUT /api/internal/shortlists/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { items } = body;
    
    if (!id) {
      return NextResponse.json(
        { data: null, error: "Shortlist ID is required" },
        { status: 400 }
      );
    }
    
    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { data: null, error: "Items array is required" },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseAdmin();
    
    // Verify shortlist exists
    const { data: shortlist, error: shortlistError } = await supabase
      .from("shortlists")
      .select("id, status")
      .eq("id", id)
      .single();
    
    if (shortlistError || !shortlist) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }
    
    // Update each item
    for (const item of items) {
      if (!item.id) continue;
      
      const updateData: any = {};
      
      if (item.quantity !== undefined) {
        updateData.quantity = item.quantity;
      }
      
      // Save to the merged 'note' field
      if (item.notes !== undefined) {
        updateData.note = item.notes;
      }
      
      const { error: updateError } = await supabase
        .from("shortlist_draft_items")
        .update(updateData)
        .eq("id", item.id)
        .eq("shortlist_id", id);
      
      if (updateError) {
        console.error("Error updating item - full Supabase error:", updateError);
        return NextResponse.json(
          { 
            data: null, 
            error: updateError.message || updateError.details || "Failed to update shortlist items" 
          },
          { status: 500 }
        );
      }
    }
    
    // Update shortlist: increment current_version_number to track draft edits
    // This does NOT affect latest_sent_version_number, so unsent changes remain
    const { data: updatedShortlist } = await supabase
      .from("shortlists")
      .select("current_version_number")
      .eq("id", id)
      .single();
    
    const currentVersion = updatedShortlist?.current_version_number || 0;
    const nextVersion = currentVersion + 1;
    
    await supabase
      .from("shortlists")
      .update({ 
        current_version_number: nextVersion,
        updated_at: new Date().toISOString() 
      })
      .eq("id", id);
    
    return NextResponse.json({
      data: { success: true },
      error: null,
    });
  } catch (err) {
    console.error("Error in PUT /api/internal/shortlists/[id] - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}

// PATCH /api/internal/shortlists/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, title, description } = body;

    if (!id) {
      return NextResponse.json(
        { data: null, error: "Shortlist ID is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Verify shortlist exists
    const { data: shortlist, error: shortlistError } = await supabase
      .from("shortlists")
      .select("id")
      .eq("id", id)
      .single();

    if (shortlistError || !shortlist) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      updateData.status = status;
    }

    if (title !== undefined) {
      updateData.title = title.trim();
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    // Update shortlist
    const { data: updated, error: updateError } = await supabase
      .from("shortlists")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating shortlist - full Supabase error:", updateError);
      return NextResponse.json(
        {
          data: null,
          error: updateError.message || updateError.details || "Failed to update shortlist",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: updated,
      error: null,
    });
  } catch (err) {
    console.error("Error in PATCH /api/internal/shortlists/[id] - full error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
