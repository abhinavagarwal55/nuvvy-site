import type { CatalogStore, PlantListItem, PlantDetail } from "./types";

// Client-side store that calls API routes
// This ensures Airtable credentials stay on the server
class ApiStore implements CatalogStore {
  private baseUrl: string;

  constructor() {
    // Use relative URLs for API routes (works in both dev and prod)
    this.baseUrl = "/api/plants";
  }

  async listPlants(): Promise<PlantListItem[]> {
    try {
      // Client-side fetch: use default caching (browser handles it)
      const response = await fetch(this.baseUrl);

      if (!response.ok) {
        console.error(`Failed to fetch plants: ${response.status}`);
        return [];
      }

      const data = (await response.json()) as { plants: PlantListItem[] };
      return data.plants || [];
    } catch (error) {
      console.error("Error fetching plants from API:", error);
      return [];
    }
  }

  async getPlantById(id: string): Promise<PlantDetail | null> {
    try {
      // Client-side fetch: use default caching (browser handles it)
      const response = await fetch(`${this.baseUrl}/${id}`);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        console.error(`Failed to fetch plant ${id}: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as { plant: PlantDetail };
      return data.plant || null;
    } catch (error) {
      console.error(`Error fetching plant ${id} from API:`, error);
      return null;
    }
  }
}

export function createApiStore(): CatalogStore {
  return new ApiStore();
}
