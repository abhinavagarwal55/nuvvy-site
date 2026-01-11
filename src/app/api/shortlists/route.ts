import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getCatalogStore } from "@/lib/catalog";

// Request payload type
interface CreateShortlistRequest {
  type: string;
  plantIds: string[];
}

// Response type
interface CreateShortlistResponse {
  id: string;
  sharePath: string;
}

// Snapshot item type
interface SnapshotItem {
  plantId: string;
  name: string;
  thumb: string | null;
  category: string;
  light: string;
  airPurifier: boolean;
}

// Snapshot type
interface ShortlistSnapshot {
  items: SnapshotItem[];
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateShortlistRequest = await req.json();

    // Validate type
    if (body.type !== "customer") {
      return NextResponse.json(
        { error: 'Invalid type. Only "customer" is supported.' },
        { status: 400 }
      );
    }

    // Validate plantIds
    if (!Array.isArray(body.plantIds) || body.plantIds.length === 0) {
      return NextResponse.json(
        { error: "plantIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (body.plantIds.length > 30) {
      return NextResponse.json(
        { error: "plantIds array cannot exceed 30 items" },
        { status: 400 }
      );
    }

    // Fetch plant details and build snapshot
    const store = getCatalogStore();
    const snapshotItems: SnapshotItem[] = [];

    for (const plantId of body.plantIds) {
      try {
        const plant = await store.getPlantById(plantId);
        if (plant) {
          snapshotItems.push({
            plantId: plant.id,
            name: plant.name,
            thumb: plant.thumbnailUrl || plant.imageUrl || null,
            category: plant.category,
            light: plant.light,
            airPurifier: plant.airPurifier === "Yes",
          });
        }
      } catch (error) {
        // Skip invalid plantIds, continue processing
        console.warn(`Skipping invalid plantId: ${plantId}`, error);
      }
    }

    // Validate that we have at least one valid item
    if (snapshotItems.length === 0) {
      return NextResponse.json(
        { error: "No valid plants found in plantIds array" },
        { status: 400 }
      );
    }

    // Build snapshot
    const snapshot: ShortlistSnapshot = {
      items: snapshotItems,
    };

    // Get user agent from request
    const userAgent = req.headers.get("user-agent") || null;

    // Insert into Supabase
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shortlists")
      .insert({
        type: "customer",
        status: "shared",
        snapshot: snapshot,
        response: {},
        customer_comment: null,
        guest_id: null,
        user_agent: userAgent,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to create shortlist" },
        { status: 500 }
      );
    }

    // Return success response
    const response: CreateShortlistResponse = {
      id: data.id,
      sharePath: `/s/${data.id}`,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Unexpected error creating shortlist:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
