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

// Helper function to extract image URL from Airtable attachment field
function getImageUrl(fields: Record<string, unknown>, useThumbnail = false): string | undefined {
  const imageField = fields["Image"];
  if (!imageField || !Array.isArray(imageField) || imageField.length === 0) {
    return undefined;
  }

  const attachment = imageField[0] as AirtableAttachment;
  if (!attachment) return undefined;

  if (useThumbnail && attachment.thumbnails?.large?.url) {
    return attachment.thumbnails.large.url;
  }

  return attachment.url;
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

  return {
    id: record.id,
    name,
    category: mapCategory(fields["Category"]),
    light: mapLightRequirement(fields["Light Requirement"]),
    thumbnailUrl: getImageUrl(fields, true) || "/images/plant-placeholder.svg",
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

  return {
    ...listItem,
    scientificName: typeof fields["Scientific Name"] === "string" ? fields["Scientific Name"] : undefined,
    imageUrl: getImageUrl(fields, false) || "/images/plant-placeholder.svg",
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

      // Paginated fetch loop (Airtable returns max 100 records per page)
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
        allRecords.push(...data.records);
        offset = data.offset;
      } while (offset);

      // Map records to PlantListItem, filtering out invalid ones
      const plants = allRecords
        .map((record) => recordToListItem(record))
        .filter((plant): plant is PlantListItem => plant !== null);

      return plants;
    } catch (error) {
      console.error("Error fetching plants from Airtable:", error);
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
