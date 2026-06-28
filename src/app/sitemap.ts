import { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/utils/metadata";
import { listPlantsFromSupabase } from "@/lib/catalog/supabasePlantStore";

// Regenerate at most hourly instead of querying Supabase on every crawl.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl().replace(/\/$/, "");

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/plantcatalog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  try {
    // Reuses the public catalog store, which applies the same visibility
    // filter the public pages use (can_be_procured = true).
    const plants = await listPlantsFromSupabase();

    const plantEntries: MetadataRoute.Sitemap = plants.map((plant) => ({
      url: `${baseUrl}/plantcatalog/${plant.id}`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    }));

    return [...staticEntries, ...plantEntries];
  } catch (error) {
    // Never throw / 500 the sitemap — fall back to the static entries.
    console.error("sitemap: failed to fetch public plants:", error);
    return staticEntries;
  }
}
