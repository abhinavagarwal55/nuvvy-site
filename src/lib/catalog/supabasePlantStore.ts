import { getSupabaseAdmin } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/utils/errors";
import type {
  PlantListItem,
  PlantDetail,
  PlantCategory,
  LightRequirement,
  WateringRequirement,
  AirPurifier,
  ToxicityLevel,
} from "./types";

// Supabase plant row type
interface SupabasePlantRow {
  airtable_id: string;
  name: string;
  scientific_name?: string | null;
  category: string;
  light: string;
  air_purifier?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  image_storage_url?: string | null;
  thumbnail_storage_url?: string | null;
  toxicity?: string | null;
  watering_requirement?: string | null;
  horticulturist_notes?: string | null;
}

// Helper to normalize image URL (validate and return valid HTTP URL or undefined)
function normalizeImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (typeof url !== "string") return undefined;
  if (!url.startsWith("http")) return undefined;
  return url;
}

/**
 * List all plants from Supabase, ordered by name ascending
 */
export async function listPlantsFromSupabase(): Promise<PlantListItem[]> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("plants")
      .select("airtable_id, name, category, light, air_purifier, thumbnail_storage_url, thumbnail_url, image_storage_url, image_url, toxicity")
      .order("name", { ascending: true });

    if (error) {
      console.error("Supabase query error:", toErrorMessage(error));
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Map Supabase rows to PlantListItem
    return data.map((row: SupabasePlantRow) => {
      const imageUrl =
        normalizeImageUrl(row.image_storage_url) ??
        normalizeImageUrl(row.image_url) ??
        undefined;

      const thumbnailUrl =
        normalizeImageUrl(row.thumbnail_storage_url) ??
        normalizeImageUrl(row.thumbnail_url) ??
        undefined;

      // Debug logging (dev only)
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        console.log("[PlantImage]", {
          id: row.airtable_id,
          image_storage_url: row.image_storage_url,
          image_url: row.image_url,
          resolved: imageUrl,
        });
      }

      return {
        id: row.airtable_id, // Use airtable_id as id for compatibility with existing UI
        name: row.name,
        category: row.category as PlantCategory,
        light: row.light as LightRequirement,
        thumbnailUrl,
        imageUrl,
        airPurifier: mapAirPurifierFromDB(row.air_purifier),
        toxicity: mapToxicityFromDB(row.toxicity),
      };
    });
  } catch (error) {
    console.error("Error fetching plants from Supabase:", toErrorMessage(error));
    return [];
  }
}

/**
 * Get a plant from Supabase by Airtable ID (returns PlantListItem)
 */
export async function getPlantFromSupabaseByAirtableId(
  airtableId: string
): Promise<PlantListItem | null> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("plants")
      .select("airtable_id, name, category, light, air_purifier, thumbnail_storage_url, thumbnail_url, image_storage_url, image_url, toxicity")
      .eq("airtable_id", airtableId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Row not found
        return null;
      }
      console.error("Supabase query error:", toErrorMessage(error));
      return null;
    }

    if (!data) {
      return null;
    }

    const row = data as SupabasePlantRow;

    const imageUrl =
      normalizeImageUrl(row.image_storage_url) ??
      normalizeImageUrl(row.image_url) ??
      undefined;

    const thumbnailUrl =
      normalizeImageUrl(row.thumbnail_storage_url) ??
      normalizeImageUrl(row.thumbnail_url) ??
      undefined;

    // Debug logging (dev only)
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      console.log("[PlantImage]", {
        id: row.airtable_id,
        image_storage_url: row.image_storage_url,
        image_url: row.image_url,
        resolved: imageUrl,
      });
    }

    return {
      id: row.airtable_id,
      name: row.name,
      category: row.category as PlantCategory,
      light: row.light as LightRequirement,
      thumbnailUrl,
      imageUrl,
      airPurifier: mapAirPurifierFromDB(row.air_purifier),
      toxicity: mapToxicityFromDB(row.toxicity),
    };
  } catch (error) {
    console.error(`Error fetching plant ${airtableId} from Supabase:`, toErrorMessage(error));
    return null;
  }
}

/**
 * Get full plant detail from Supabase by Airtable ID (returns PlantDetail)
 */
export async function getPlantDetailFromSupabaseByAirtableId(
  airtableId: string
): Promise<PlantDetail | null> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("plants")
      .select("*")
      .eq("airtable_id", airtableId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Row not found
        return null;
      }
      console.error("Supabase query error:", toErrorMessage(error));
      return null;
    }

    if (!data) {
      return null;
    }

    const row = data as SupabasePlantRow;

    const imageUrl =
      normalizeImageUrl(row.image_storage_url) ??
      normalizeImageUrl(row.image_url) ??
      undefined;

    const thumbnailUrl =
      normalizeImageUrl(row.thumbnail_storage_url) ??
      normalizeImageUrl(row.thumbnail_url) ??
      undefined;

    // Debug logging (dev only)
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      console.log("[PlantImage]", {
        id: row.airtable_id,
        image_storage_url: row.image_storage_url,
        image_url: row.image_url,
        resolved: imageUrl,
      });
    }

    return {
      id: row.airtable_id,
      name: row.name,
      category: row.category as PlantCategory,
      light: row.light as LightRequirement,
      thumbnailUrl,
      imageUrl,
      airPurifier: mapAirPurifierFromDB(row.air_purifier),
      toxicity: mapToxicityFromDB(row.toxicity),
      scientificName: row.scientific_name || undefined,
      horticulturistNotes: row.horticulturist_notes || undefined,
      wateringRequirement: mapWateringRequirementFromDB(row.watering_requirement),
    };
  } catch (error) {
    console.error(`Error fetching plant detail ${airtableId} from Supabase:`, toErrorMessage(error));
    return null;
  }
}

// Helper to map air_purifier from DB to AirPurifier type
function mapAirPurifierFromDB(value: string | null | undefined): AirPurifier | undefined {
  if (!value) return undefined;
  // Safely handle non-string values
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes" || normalized === "true" || normalized === "1") return "Yes";
  if (normalized === "no" || normalized === "false" || normalized === "0") return "No";
  return undefined;
}

// Helper to map toxicity from DB to ToxicityLevel type
function mapToxicityFromDB(value: string | null | undefined): ToxicityLevel | undefined {
  if (!value) return undefined;
  // Safely handle non-string values
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  if (lower.includes("safe") || lower.includes("pet safe")) return "Pet Safe";
  if (lower.includes("mildly")) return "Mildly Toxic";
  if (lower.includes("toxic")) return "Toxic";
  return undefined;
}

// Helper to map watering requirement from DB to WateringRequirement type
function mapWateringRequirementFromDB(value: string | null | undefined): WateringRequirement | undefined {
  if (!value) return undefined;
  // Safely handle non-string values
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  if (lower.includes("very high")) return "Very High";
  if (lower.includes("high")) return "High";
  if (lower.includes("medium")) return "Medium";
  if (lower.includes("low")) return "Low";
  return undefined;
}
