import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { uploadExternalImageToStorage } from "@/lib/supabase/storage";
import { createAirtableStore } from "@/lib/catalog/airtableStore";
import type { PlantDetail } from "@/lib/catalog/types";

// Response type
interface SyncResponse {
  success: boolean;
  total: number;
  synced: number;
  failed: number;
  failedIds: string[];
}

export async function POST(req: NextRequest) {
  // Gate: Airtable sync is disabled by default since Supabase is now canonical
  // Set ENABLE_AIRTABLE_SYNC=true to re-enable (for migration purposes only)
  const enableAirtableSync = process.env.ENABLE_AIRTABLE_SYNC;
  if (enableAirtableSync !== "true") {
    return NextResponse.json(
      { error: "Airtable sync disabled. Supabase is canonical." },
      { status: 410 }
    );
  }

  try {
    // Check admin secret header
    const adminSecret = req.headers.get("x-admin-secret");
    const requiredSecret = process.env.ADMIN_SYNC_SECRET;

    if (!requiredSecret) {
      return NextResponse.json(
        { error: "ADMIN_SYNC_SECRET not configured" },
        { status: 500 }
      );
    }

    if (!adminSecret || adminSecret !== requiredSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Fetch all plants from Airtable (directly, not via getCatalogStore)
    let airtableStore;
    try {
      airtableStore = createAirtableStore();
    } catch (error) {
      console.error("[Sync] Failed to create Airtable store:", error);
      return NextResponse.json(
        { error: "Failed to initialize Airtable store" },
        { status: 500 }
      );
    }

    // Debug: Check Airtable config presence (not values)
    const hasBaseId = !!process.env.AIRTABLE_BASE_ID;
    const hasTableName = !!(process.env.AIRTABLE_PLANTS_TABLE || "Plants");
    console.log(`[Sync] Airtable config check - baseId present: ${hasBaseId}, table name present: ${hasTableName}`);

    const airtablePlants = await airtableStore.listPlants();

    // Debug: Log how many Airtable records were fetched
    console.log(`[Sync] Fetched ${airtablePlants.length} plants from Airtable`);

    if (airtablePlants.length === 0) {
      console.warn(`[Sync] WARNING: Airtable returned 0 plants. baseId present: ${hasBaseId}, table name present: ${hasTableName}`);
      return NextResponse.json({
        success: true,
        total: 0,
        synced: 0,
        failed: 0,
        failedIds: [],
      });
    }

    // Get full plant details for each (needed for all fields)
    const supabase = getSupabaseAdmin();
    
    // Fetch existing storage URLs to avoid re-uploading
    const { data: existingPlants } = await supabase
      .from("plants")
      .select("airtable_id, image_storage_url, thumbnail_storage_url");
    
    const existingStorageUrls = new Map<string, { image?: string; thumbnail?: string }>();
    if (existingPlants) {
      for (const plant of existingPlants) {
        existingStorageUrls.set(plant.airtable_id, {
          image: plant.image_storage_url || undefined,
          thumbnail: plant.thumbnail_storage_url || undefined,
        });
      }
    }

    // Helper to check if URL is from Airtable
    const isAirtableUrl = (url: string | undefined | null): boolean => {
      if (!url) return false;
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes("airtableusercontent.com");
      } catch {
        return false;
      }
    };

    let synced = 0;
    let failed = 0;
    const failedIds: string[] = [];

    for (const plantListItem of airtablePlants) {
      try {
        // Fetch full plant detail from Airtable
        const plantDetail = await airtableStore.getPlantById(plantListItem.id);

        if (!plantDetail) {
          failed++;
          failedIds.push(plantListItem.id);
          console.warn(`Skipping plant ${plantListItem.id}: could not fetch full details`);
          continue;
        }

        // Check existing storage URLs (only use if non-empty string)
        const existing = existingStorageUrls.get(plantDetail.id);
        let imageStorageUrl = (existing?.image && typeof existing.image === "string" && existing.image.trim() !== "") 
          ? existing.image 
          : null;
        let thumbnailStorageUrl = (existing?.thumbnail && typeof existing.thumbnail === "string" && existing.thumbnail.trim() !== "") 
          ? existing.thumbnail 
          : null;

        // Mirror images to Supabase Storage if needed
        // Explicit guard: URL must exist AND be an Airtable URL
        if (!imageStorageUrl && plantDetail.imageUrl && isAirtableUrl(plantDetail.imageUrl)) {
          try {
            const storagePath = `plants/${plantDetail.id}/image`;
            // TypeScript now knows plantDetail.imageUrl is string (not undefined)
            imageStorageUrl = await uploadExternalImageToStorage({
              bucket: "plant-images",
              path: storagePath,
              url: plantDetail.imageUrl,
            });
            console.log(`[Sync] Uploaded image for ${plantDetail.id}`);
          } catch (error) {
            console.error(`[Sync] Failed to upload image for ${plantDetail.id}:`, error);
            // Continue without storage URL, will use Airtable URL as fallback
          }
        }

        // Explicit guard: URL must exist AND be an Airtable URL
        if (!thumbnailStorageUrl && plantDetail.thumbnailUrl && isAirtableUrl(plantDetail.thumbnailUrl)) {
          try {
            const storagePath = `plants/${plantDetail.id}/thumb`;
            // TypeScript now knows plantDetail.thumbnailUrl is string (not undefined)
            thumbnailStorageUrl = await uploadExternalImageToStorage({
              bucket: "plant-images",
              path: storagePath,
              url: plantDetail.thumbnailUrl,
            });
            console.log(`[Sync] Uploaded thumbnail for ${plantDetail.id}`);
          } catch (error) {
            console.error(`[Sync] Failed to upload thumbnail for ${plantDetail.id}:`, error);
            // Continue without storage URL, will use Airtable URL as fallback
          }
        }

        // Prepare upsert data
        const upsertData = {
          airtable_id: plantDetail.id,
          name: plantDetail.name,
          scientific_name: plantDetail.scientificName || null,
          category: plantDetail.category,
          light: plantDetail.light,
          air_purifier: plantDetail.airPurifier || null,
          image_url: plantDetail.imageUrl || null,
          thumbnail_url: plantDetail.thumbnailUrl || null,
          image_storage_url: imageStorageUrl,
          thumbnail_storage_url: thumbnailStorageUrl,
          toxicity: plantDetail.toxicity || null,
          watering_requirement: plantDetail.wateringRequirement || null,
          horticulturist_notes: plantDetail.horticulturistNotes || null,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
        };

        // Upsert into Supabase using airtable_id as unique key
        const { error } = await supabase
          .from("plants")
          .upsert(upsertData, {
            onConflict: "airtable_id",
          });

        if (error) {
          console.error(`Failed to upsert plant ${plantDetail.id}:`, error);
          failed++;
          failedIds.push(plantDetail.id);
        } else {
          synced++;
        }
      } catch (error) {
        console.error(`Error processing plant ${plantListItem.id}:`, error);
        failed++;
        failedIds.push(plantListItem.id);
      }
    }

    const response: SyncResponse = {
      success: true,
      total: airtablePlants.length,
      synced,
      failed,
      failedIds,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Unexpected error in sync:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
