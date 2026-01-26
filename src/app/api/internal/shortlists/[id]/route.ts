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
    
    // Get latest CUSTOMER_SUBMITTED version (PRIORITY 1)
    const { data: latestSubmittedVersion } = await supabase
      .from("shortlist_versions")
      .select("id, version_number, created_at, status_at_time")
      .eq("shortlist_id", id)
      .eq("status_at_time", "CUSTOMER_SUBMITTED")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // Get latest SENT_TO_CUSTOMER version (PRIORITY 2 - fallback)
    const { data: latestSentVersion } = await supabase
      .from("shortlist_versions")
      .select("id, version_number, created_at, status_at_time")
      .eq("shortlist_id", id)
      .eq("status_at_time", "SENT_TO_CUSTOMER")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const currentVersionNumber = shortlist.current_version_number || 0;
    const latestSubmittedVersionNumber = latestSubmittedVersion?.version_number || 0;
    const latestSentVersionNumber = latestSentVersion?.version_number || 0;
    
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
    
    // Determine which version to show by default (VERSION SELECTION LOGIC):
    // 1. If there's a newer draft (current_version_number > latest_submitted_version_number), show draft
    // 2. Otherwise, prefer CUSTOMER_SUBMITTED version if it exists
    // 3. Fallback to latest SENT_TO_CUSTOMER version if no submitted version
    // 4. Otherwise show draft items
    let itemsToReturn = items || [];
    let showingVersionItems = false;
    let selectedVersion = null;
    let selectedVersionNumber = 0;
    
    // Check if there's a newer draft than the submitted version
    const hasNewerDraft = currentVersionNumber > latestSubmittedVersionNumber;
    
    if (latestSubmittedVersion && !hasNewerDraft) {
      // PRIORITY 1: Show CUSTOMER_SUBMITTED version
      selectedVersion = latestSubmittedVersion;
      selectedVersionNumber = latestSubmittedVersion.version_number;
      
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
    } else if (latestSentVersion && currentVersionNumber <= latestSentVersionNumber) {
      // PRIORITY 2: Fallback to latest SENT_TO_CUSTOMER version (only if no newer draft)
      selectedVersion = latestSentVersion;
      selectedVersionNumber = latestSentVersion.version_number;
      
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
        .eq("shortlist_version_id", latestSentVersion.id);
      
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
    // Otherwise, show draft items (no version selected)
    
    // Check for unsent changes using version number comparison
    // hasUnsentChanges = current_version_number > latest_sent_version_number
    // Use the highest of submitted or sent version number for comparison
    const latestCustomerFacingVersionNumber = Math.max(latestSubmittedVersionNumber, latestSentVersionNumber);
    let hasUnsentChanges = false;
    if (shortlist.status === "SENT_TO_CUSTOMER" || shortlist.status === "CUSTOMER_SUBMITTED") {
      hasUnsentChanges = currentVersionNumber > latestCustomerFacingVersionNumber;
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
        selected_version_number: selectedVersionNumber, // Version number being displayed
        selected_version_status: selectedVersion?.status_at_time || null, // Status of displayed version
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
    const { items, source_version_status } = body; // Accept source_version_status to detect CUSTOMER_SUBMITTED
    
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
    
    // Verify shortlist exists and get current state
    const { data: shortlist, error: shortlistError } = await supabase
      .from("shortlists")
      .select("id, status, current_version_number")
      .eq("id", id)
      .single();
    
    if (shortlistError || !shortlist) {
      return NextResponse.json(
        { data: null, error: "Shortlist not found" },
        { status: 404 }
      );
    }
    
    // CRITICAL: Block ALL updates to CUSTOMER_SUBMITTED versions
    // Check if shortlist status is CUSTOMER_SUBMITTED or if we're viewing a submitted version
    const { data: latestSubmittedVersion } = await supabase
      .from("shortlist_versions")
      .select("id, version_number")
      .eq("shortlist_id", id)
      .eq("status_at_time", "CUSTOMER_SUBMITTED")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const currentVersionNumber = shortlist.current_version_number || 0;
    const isSubmittedVersion = shortlist.status === "CUSTOMER_SUBMITTED" || 
                               (latestSubmittedVersion && currentVersionNumber <= latestSubmittedVersion.version_number);
    
    if (isSubmittedVersion) {
      // BLOCK: Customer Submitted versions are IMMUTABLE
      return NextResponse.json(
        { data: null, error: "Customer-submitted versions cannot be modified. Create a new version to make changes." },
        { status: 403 }
      );
    }
    
    // Legacy code path for creating draft from submitted (should not be used anymore)
    // Keep for backward compatibility but it will be blocked by the check above
    if (source_version_status === "CUSTOMER_SUBMITTED") {
      // Get the submitted version to copy from
      const { data: submittedVersion } = await supabase
        .from("shortlist_versions")
        .select("id, version_number")
        .eq("shortlist_id", id)
        .eq("status_at_time", "CUSTOMER_SUBMITTED")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!submittedVersion) {
        return NextResponse.json(
          { data: null, error: "Submitted version not found" },
          { status: 404 }
        );
      }
      
      // Fetch version items from the submitted version
      const { data: versionItems, error: versionItemsError } = await supabase
        .from("shortlist_version_items")
        .select("plant_id, quantity, note, why_picked_for_balcony")
        .eq("shortlist_version_id", submittedVersion.id);
      
      if (versionItemsError || !versionItems) {
        return NextResponse.json(
          { data: null, error: "Failed to fetch submitted version items" },
          { status: 500 }
        );
      }
      
      // Create a map of edited items by plant_id for quick lookup
      // Only include items that are in the request (user may have removed some)
      const editedItemsMap = new Map<string, { quantity: number; notes: string | null }>();
      items.forEach((item: any) => {
        if (item.plant_id) {
          editedItemsMap.set(item.plant_id, {
            quantity: item.quantity !== undefined ? item.quantity : 1,
            notes: item.notes !== undefined ? item.notes : null,
          });
        }
      });
      
      // Delete existing draft items
      const { error: deleteError } = await supabase
        .from("shortlist_draft_items")
        .delete()
        .eq("shortlist_id", id);
      
      if (deleteError) {
        console.error("Error deleting draft items:", deleteError);
        return NextResponse.json(
          { data: null, error: "Failed to clear draft items" },
          { status: 500 }
        );
      }
      
      // Create new draft items ONLY for items in the request (respects removals)
      // Match by plant_id to get original why_picked_for_balcony from version
      const draftItems = items
        .filter((item: any) => item.plant_id) // Only include items with plant_id
        .map((item: any) => {
          const originalVersionItem = versionItems.find((vi: any) => vi.plant_id === item.plant_id);
          return {
            shortlist_id: id,
            plant_id: item.plant_id,
            quantity: item.quantity !== undefined ? item.quantity : (originalVersionItem?.quantity || null),
            note: item.notes !== undefined ? item.notes : (originalVersionItem?.note || null),
            why_picked_for_balcony: originalVersionItem?.why_picked_for_balcony || null,
          };
        });
      
      const { error: insertError } = await supabase
        .from("shortlist_draft_items")
        .insert(draftItems);
      
      if (insertError) {
        console.error("Error creating draft items:", insertError);
        return NextResponse.json(
          { data: null, error: "Failed to create draft from submitted version" },
          { status: 500 }
        );
      }
      
      // Update shortlist: increment current_version_number and set status to DRAFT
      const currentVersion = shortlist.current_version_number || 0;
      const nextVersion = currentVersion + 1;
      
      const { error: updateError } = await supabase
        .from("shortlists")
        .update({ 
          status: "DRAFT",
          current_version_number: nextVersion,
          updated_at: new Date().toISOString() 
        })
        .eq("id", id);
      
      if (updateError) {
        console.error("Error updating shortlist:", updateError);
        return NextResponse.json(
          { data: null, error: "Failed to update shortlist" },
          { status: 500 }
        );
      }
      
      return NextResponse.json({
        data: { 
          success: true,
          new_version_number: nextVersion,
          created_from_submitted: true,
        },
        error: null,
      });
    }
    
    // Normal flow: Update existing draft items
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
