import { mockCatalogStore } from "./mockStore";
import { createApiStore } from "./apiStore";
import type { CatalogStore } from "./types";

// Export the catalog store
// On client-side: uses API routes (which use Supabase)
// On server-side: uses Supabase directly for public plant catalog routes
// Airtable is only used for admin sync operations (gated by ENABLE_AIRTABLE_SYNC)
export function getCatalogStore(): CatalogStore {
  // Check if we're in browser (client-side)
  const isClient = typeof window !== "undefined";

  if (isClient) {
    // Client-side: use API routes to keep credentials secure
    // API routes use Supabase for public plant catalog
    return createApiStore();
  }

  // Server-side: use Supabase for public plant catalog (Supabase is canonical)
  // Only use Airtable for admin sync operations (gated by ENABLE_AIRTABLE_SYNC env var)
  try {
    const { listPlantsFromSupabase, getPlantDetailFromSupabaseByAirtableId } = require("./supabasePlantStore");
    return {
      async listPlants() {
        return listPlantsFromSupabase();
      },
      async getPlantById(id: string) {
        return getPlantDetailFromSupabaseByAirtableId(id);
      },
    };
  } catch (error) {
    console.error("Failed to create Supabase store, falling back to mock store:", error);
    return mockCatalogStore;
  }
}

// Re-export types for convenience
export type {
  PlantListItem,
  PlantDetail,
  PlantCategory,
  LightRequirement,
  WateringRequirement,
  AirPurifier,
  ToxicityLevel,
} from "./types";
