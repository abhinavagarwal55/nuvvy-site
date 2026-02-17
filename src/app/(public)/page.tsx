import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import HomepageRenderer from "./HomepageRenderer";
import { getSiteUrl } from "@/lib/utils/metadata";

export const dynamic = "force-dynamic";

// Get site URL for metadata
const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: "Nuvvy | Horticulturist-led garden care for your balcony",
  description: "Professional plant care, expert selection, and ongoing maintenance — without the effort.",
  openGraph: {
    title: "Horticulturist-led garden care for your balcony",
    description: "Professional plant care, expert selection, and ongoing maintenance — without the effort.",
    url: siteUrl,
    siteName: "Nuvvy",
    images: [
      {
        url: "/images/whatsapp_preview_compressed_final.png", // Relative path - metadataBase will resolve it
        width: 1200,
        height: 630,
        alt: "Nuvvy - Horticulturist-led garden care",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Horticulturist-led garden care for your balcony",
    description: "Professional plant care, expert selection, and ongoing maintenance — without the effort.",
    images: ["/images/whatsapp_preview_compressed_final.png"], // Relative path - metadataBase will resolve it
  },
};

async function getFeaturedPlantIds(): Promise<string[]> {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Fetch the most recent homepage_content row (no status filter)
    const { data, error } = await supabase
      .from("homepage_content")
      .select("content")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching homepage content:", error);
      return [];
    }

    if (!data || !data.content) {
      console.warn("No homepage content found");
      return [];
    }

    // Extract mostPopularPlants.plantIds from the content
    const content = data.content as any;
    if (content?.mostPopularPlants?.plantIds && Array.isArray(content.mostPopularPlants.plantIds)) {
      return content.mostPopularPlants.plantIds;
    }

    return [];
  } catch (error) {
    console.error("Error in getFeaturedPlantIds:", error);
    return [];
  }
}

async function getPlantsByIds(plantIds: string[]) {
  if (!plantIds || plantIds.length === 0) return [];

  try {
    const supabase = await createServerSupabaseClient();
    
    const { data, error } = await supabase
      .from("plants")
      .select("id, airtable_id, name, light, category, watering_requirement, price_band, thumbnail_storage_url, thumbnail_url, image_storage_url, image_url")
      .in("id", plantIds)
      .eq("can_be_procured", true);

    if (error || !data) {
      console.error("Error fetching plants:", error);
      return [];
    }

    // Create a map for quick lookup
    const plantMap = new Map(data.map((p) => [p.id, p]));
    
    // Preserve order from plantIds and filter out missing plants
    return plantIds
      .map((id) => plantMap.get(id))
      .filter((plant): plant is NonNullable<typeof plant> => plant !== undefined);
  } catch (error) {
    console.error("Error in getPlantsByIds:", error);
    return [];
  }
}

export default async function HomePage() {
  try {
    // Fetch featured plant IDs from homepage_content table
    const featuredPlantIds = await getFeaturedPlantIds();

    // Fetch popular plants
    const popularPlants = await getPlantsByIds(featuredPlantIds);

    return (
      <HomepageRenderer
        popularPlants={popularPlants}
      />
    );
  } catch (error) {
    // Log error for debugging
    console.error("Error loading homepage:", error);

    // Return a user-friendly error page
    return (
      <main className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">
            Homepage Unavailable
          </h1>
          <p className="text-gray-600 mb-2">
            {error instanceof Error
              ? error.message
              : "Unable to load featured plants."}
          </p>
          <p className="text-sm text-gray-500 mt-4">
            Please ensure featured plants are configured in the database.
          </p>
        </div>
    </main>
  );
  }
}
