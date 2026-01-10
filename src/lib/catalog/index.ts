import { mockCatalogStore } from "./mockStore";
import { createApiStore } from "./apiStore";
import type { CatalogStore } from "./types";

// Export the catalog store
// On client-side: uses API routes (which handle Airtable vs mock server-side)
// On server-side: would use Airtable directly, but since UI pages are client components,
// they'll use API routes which route to Airtable or mock based on env vars
export function getCatalogStore(): CatalogStore {
  // Check if we're in browser (client-side)
  const isClient = typeof window !== "undefined";

  if (isClient) {
    // Client-side: use API routes to keep credentials secure
    return createApiStore();
  }

  // Server-side: check if Airtable is configured
  // This path is only hit during SSR or API routes
  const hasAirtableConfig =
    typeof process !== "undefined" &&
    process.env.AIRTABLE_API_KEY &&
    process.env.AIRTABLE_BASE_ID;

  if (hasAirtableConfig) {
    try {
      // Dynamic import to avoid loading Airtable store on client
      const { createAirtableStore } = require("./airtableStore");
      return createAirtableStore();
    } catch (error) {
      console.error("Failed to create Airtable store, falling back to mock store:", error);
      return mockCatalogStore;
    }
  }

  return mockCatalogStore;
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
