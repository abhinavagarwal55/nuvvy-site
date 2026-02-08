import { getHomepageContent } from "@/lib/homepage/getHomepageContent";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import HomepagePreviewWrapper from "./HomepagePreviewWrapper";

export const dynamic = "force-dynamic";

async function getPlantsByIds(plantIds: string[]) {
  if (!plantIds || plantIds.length === 0) return [];

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
}

export default async function HomepagePreviewPage() {
  const whatsappNumber = "919876543210"; // Placeholder
  const whatsappMessage = encodeURIComponent("Hi, I'm interested in Nuvvy Garden Care");

  // Always fetch draft content for preview
  const homepageContent = await getHomepageContent("draft");

  // Fetch popular plants
  const popularPlants = await getPlantsByIds(homepageContent.mostPopularPlants.plantIds);

  return (
    <HomepagePreviewWrapper
      homepageContent={homepageContent}
      popularPlants={popularPlants}
      whatsappNumber={whatsappNumber}
      whatsappMessage={whatsappMessage}
    />
  );
}
