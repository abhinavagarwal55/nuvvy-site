// Plant Catalog Types

export type PlantCategory =
  | "Indoor plant"
  | "Flowering"
  | "Creepers"
  | "Aromatic"
  | "Fruit Plants"
  | "Vegetables";

export type LightRequirement =
  | "Low bright indirect"
  | "Bright indirect"
  | "Medium indirect"
  | "Bright indirect to partial shade"
  | "Full sunlight (6-8 hours)"
  | "Full- partial sunlight (4-6 hours)"
  | "Partial sunlight (4-6 hours)";

export type WateringRequirement = "Low" | "Medium" | "High" | "Very High";

export type AirPurifier = "Yes" | "No";

// Kept for backward compatibility but not used in UI
export type ToxicityLevel = "Pet Safe" | "Mildly Toxic" | "Toxic" | "Unknown";

// Lightweight list item (for catalog view)
export interface PlantListItem {
  id: string;
  name: string;
  category: PlantCategory;
  light: LightRequirement;
  thumbnailUrl?: string;
  imageUrl?: string;
  airPurifier?: AirPurifier;
  // Toxicity kept for backward compatibility but not rendered in UI
  toxicity?: ToxicityLevel;
}

// Full detail (for detail page)
export interface PlantDetail extends PlantListItem {
  scientificName?: string;
  imageUrl?: string;
  horticulturistNotes?: string;
  wateringRequirement?: WateringRequirement;
  soilMix?: string;
  fertilizationRequirement?: string;
}

// Catalog Store Interface
export interface CatalogStore {
  listPlants(): Promise<PlantListItem[]>;
  getPlantById(id: string): Promise<PlantDetail | null>;
}
