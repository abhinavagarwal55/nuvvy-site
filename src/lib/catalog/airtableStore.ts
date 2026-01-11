import type {
  CatalogStore,
  PlantListItem,
  PlantDetail,
  PlantCategory,
  LightRequirement,
  WateringRequirement,
  AirPurifier,
  ToxicityLevel,
} from "./types";

// Airtable API types
interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
}

interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
  thumbnails?: {
    small?: { url: string; width: number; height: number };
    large?: { url: string; width: number; height: number };
    full?: { url: string; width: number; height: number };
  };
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

// Helper function to map toxicity string to ToxicityLevel (kept for backward compatibility)
function mapToxicityLevel(value: unknown): ToxicityLevel | undefined {
  if (!value || typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  if (lower.includes("safe") || lower.includes("pet safe")) return "Pet Safe";
  if (lower.includes("mildly")) return "Mildly Toxic";
  if (lower.includes("toxic")) return "Toxic";
  return undefined;
}

// Helper function to validate and map category
function mapCategory(value: unknown): PlantCategory {
  if (typeof value !== "string") return "Indoor plant"; // Default for missing data
  const validCategories: PlantCategory[] = [
    "Indoor plant",
    "Flowering",
    "Creepers",
    "Aromatic",
    "Fruit Plants",
    "Vegetables"
  ];
  // Pass through if it matches exactly, otherwise default to "Indoor plant" for required field
  return validCategories.includes(value as PlantCategory) ? (value as PlantCategory) : "Indoor plant";
}

// Helper function to validate and map light requirement
function mapLightRequirement(value: unknown): LightRequirement {
  if (typeof value !== "string") return "Bright indirect"; // Default for missing data
  const validLight: LightRequirement[] = [
    "Low bright indirect",
    "Bright indirect",
    "Medium indirect",
    "Bright indirect to partial shade",
    "Full sunlight (6-8 hours)",
    "Full- partial sunlight (4-6 hours)",
    "Partial sunlight (4-6 hours)"
  ];
  // Pass through if it matches exactly, otherwise default to "Bright indirect" for required field
  return validLight.includes(value as LightRequirement) ? (value as LightRequirement) : "Bright indirect";
}

// Helper function to map Air Purifier field
function mapAirPurifier(value: unknown): AirPurifier | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "yes" || normalized === "true" || normalized === "1") return "Yes";
    if (normalized === "no" || normalized === "false" || normalized === "0") return "No";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return undefined;
}

// Helper function to map watering requirement
function mapWateringRequirement(value: unknown): WateringRequirement | undefined {
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  if (lower.includes("very high")) return "Very High";
  if (lower.includes("high")) return "High";
  if (lower.includes("medium")) return "Medium";
  if (lower.includes("low")) return "Low";
  return undefined;
}

// Helper function to extract image URLs from Airtable attachment field
// Returns { imageUrl: string | null, thumbnailUrl: string | null }
function getAirtableAttachmentUrls(value: unknown): {
  imageUrl: string | null;
  thumbnailUrl: string | null;
} {
  // Defensive checks: must be an array with at least one item
  if (!value || !Array.isArray(value) || value.length === 0) {
    return { imageUrl: null, thumbnailUrl: null };
  }

  // Get first attachment object
  const firstAttachment = value[0];
  if (!firstAttachment || typeof firstAttachment !== "object" || firstAttachment === null) {
    return { imageUrl: null, thumbnailUrl: null };
  }

  // Type guard for attachment structure
  const attachment = firstAttachment as Partial<AirtableAttachment>;

  // Extract imageUrl from attachment.url (must be string)
  let imageUrl: string | null = null;
  if (attachment.url && typeof attachment.url === "string" && attachment.url.trim() !== "") {
    imageUrl = attachment.url;
  }

  // Extract thumbnailUrl: prefer large, then small, then null
  let thumbnailUrl: string | null = null;
  if (attachment.thumbnails && typeof attachment.thumbnails === "object") {
    const thumbnails = attachment.thumbnails as Partial<AirtableAttachment["thumbnails"]>;
    
    // Try large first
    if (
      thumbnails.large &&
      typeof thumbnails.large === "object" &&
      thumbnails.large.url &&
      typeof thumbnails.large.url === "string" &&
      thumbnails.large.url.trim() !== ""
    ) {
      thumbnailUrl = thumbnails.large.url;
    }
    // Fall back to small
    else if (
      thumbnails.small &&
      typeof thumbnails.small === "object" &&
      thumbnails.small.url &&
      typeof thumbnails.small.url === "string" &&
      thumbnails.small.url.trim() !== ""
    ) {
      thumbnailUrl = thumbnails.small.url;
    }
  }

  // Debug logging (non-production only)
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    console.log(
      `[Airtable] attachment parse: image_url present: ${imageUrl !== null}, thumbnail_url present: ${thumbnailUrl !== null}`
    );
  }

  return { imageUrl, thumbnailUrl };
}

// Convert Airtable record to PlantListItem
function recordToListItem(record: AirtableRecord): PlantListItem | null {
  const fields = record.fields;

  // Required fields
  const name = fields["Plant Name"];
  if (!name || typeof name !== "string") {
    console.warn(`Skipping record ${record.id}: missing Plant Name`);
    return null;
  }

  // Extract image URLs from Airtable attachment field
  const imageField = fields["Image"] || fields["Images"];
  const { imageUrl, thumbnailUrl } = getAirtableAttachmentUrls(imageField);

  return {
    id: record.id,
    name,
    category: mapCategory(fields["Category"]),
    light: mapLightRequirement(fields["Light Requirement"]),
    thumbnailUrl: thumbnailUrl || undefined,
    airPurifier: mapAirPurifier(fields["Air Purifier"]),
    toxicity: mapToxicityLevel(fields["Toxicity"]),
  };
}

// Convert Airtable record to PlantDetail
function recordToDetail(record: AirtableRecord): PlantDetail | null {
  const fields = record.fields;

  // Required fields
  const name = fields["Plant Name"];
  if (!name || typeof name !== "string") {
    console.warn(`Skipping record ${record.id}: missing Plant Name`);
    return null;
  }

  const listItem = recordToListItem(record);
  if (!listItem) return null;

  // Extract image URLs from Airtable attachment field (if not already done in listItem)
  const imageField = fields["Image"] || fields["Images"];
  const { imageUrl } = getAirtableAttachmentUrls(imageField);

  return {
    ...listItem,
    scientificName: typeof fields["Scientific Name"] === "string" ? fields["Scientific Name"] : undefined,
    imageUrl: imageUrl || undefined,
    horticulturistNotes: typeof fields["Horticulturist Notes"] === "string" ? fields["Horticulturist Notes"] : undefined,
    wateringRequirement: mapWateringRequirement(fields["Watering Requirement"]),
    soilMix: typeof fields["Soil Mix"] === "string" ? fields["Soil Mix"] : undefined,
    fertilizationRequirement:
      typeof fields["Fertilization Requirement"] === "string" ? fields["Fertilization Requirement"] : undefined,
  };
}

// Airtable Catalog Store Implementation
class AirtableStore implements CatalogStore {
  private apiKey: string;
  private baseId: string;
  private tableName: string;

  constructor() {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_PLANTS_TABLE || "Plants";

    if (!apiKey || !baseId) {
      throw new Error("AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables are required");
    }

    this.apiKey = apiKey;
    this.baseId = baseId;
    this.tableName = tableName;
  }

  private getBaseUrl(): string {
    return `https://api.airtable.com/v0/${this.baseId}/${this.tableName}`;
  }

  private async fetchAirtable(
    url: string,
    options: { revalidate?: number; cache?: RequestCache } = {}
  ): Promise<Response> {
    // Use Next.js fetch with caching when running on server (App Router)
    // The next and cache options are Next.js-specific extensions to fetch
    const headers: HeadersInit = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    // Build fetch options - Next.js extends fetch with 'next' and 'cache' options
    const fetchOptions: RequestInit & { next?: { revalidate?: number }; cache?: RequestCache } = {
      headers,
    };

    // Add Next.js caching options only when running on server
    if (typeof window === "undefined") {
      fetchOptions.next = {
        revalidate: options.revalidate ?? 300,
      };
      fetchOptions.cache = options.cache ?? "force-cache";
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Airtable API error (${response.status}): ${errorText}`);
    }

    return response;
  }

  async listPlants(): Promise<PlantListItem[]> {
    try {
      const allRecords: AirtableRecord[] = [];
      let offset: string | undefined;
      let pageNumber = 1;
      const maxPages = 20;
      const isServer = typeof window === "undefined";

      // Manual pagination loop using Airtable REST API
      // Loop until offset is absent or maxPages is reached
      do {
        const url = new URL(this.getBaseUrl());
        url.searchParams.set("pageSize", "100");
        if (offset) {
          url.searchParams.set("offset", offset);
        }

        const response = await this.fetchAirtable(url.toString(), {
          revalidate: 300,
          cache: "force-cache",
        });

        const data = (await response.json()) as AirtableResponse;

        // Debug logging (server-side only)
        if (isServer) {
          console.log(`[Airtable] Fetched page ${pageNumber}: ${data.records.length} records`);
        }

        allRecords.push(...data.records);
        offset = data.offset;
        pageNumber++;

        // Guard against infinite loops
        if (pageNumber > maxPages) {
          if (isServer) {
            console.warn(`[Airtable] Reached maxPages limit (${maxPages}). Stopping pagination.`);
          }
          break;
        }
      } while (offset);

      if (isServer) {
        console.log(`[Airtable] Total records fetched: ${allRecords.length}`);
      }

      // Map records to PlantListItem, filtering out invalid ones
      const plants = allRecords
        .map((record) => recordToListItem(record))
        .filter((plant): plant is PlantListItem => plant !== null);

      return plants;
    } catch (error) {
      console.error("Airtable fetch failed", error);
      return [];
    }
  }

  async getPlantById(id: string): Promise<PlantDetail | null> {
    try {
      const url = `${this.getBaseUrl()}/${id}`;
      const response = await this.fetchAirtable(url, {
        revalidate: 3600,
        cache: "force-cache",
      });

      const data = (await response.json()) as AirtableRecord;
      return recordToDetail(data);
    } catch (error) {
      console.error(`Error fetching plant ${id} from Airtable:`, error);
      return null;
    }
  }
}

export function createAirtableStore(): CatalogStore {
  return new AirtableStore();
}
