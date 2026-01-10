import type { Metadata } from "next";
import { getCatalogStore } from "@/lib/catalog";
import { getAbsoluteImageUrl, getSiteUrl, truncateText } from "@/lib/utils/metadata";
import { OG_DEFAULT_IMAGE } from "@/lib/constants";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const { id } = await params;
    const store = getCatalogStore();
    const plant = await store.getPlantById(id);

    if (!plant) {
      // Fallback metadata for plant not found
      return {
        title: "Plant not found | Nuvvy Plant Catalog",
        description: "The requested plant could not be found in our catalog.",
        openGraph: {
          title: "Plant not found | Nuvvy Plant Catalog",
          description: "The requested plant could not be found in our catalog.",
          url: `${getSiteUrl()}/plantcatalog/${id}`,
          siteName: "Nuvvy",
          images: [
            {
              url: getAbsoluteImageUrl(OG_DEFAULT_IMAGE),
              width: 1200,
              height: 630,
              alt: "Nuvvy Plant Catalog",
            },
          ],
          type: "website",
        },
        twitter: {
          card: "summary_large_image",
          title: "Plant not found | Nuvvy Plant Catalog",
          description: "The requested plant could not be found in our catalog.",
          images: [getAbsoluteImageUrl(OG_DEFAULT_IMAGE)],
        },
      };
    }

    // Use plant image if available, otherwise fallback to OG default
    const imageUrl = plant.imageUrl || OG_DEFAULT_IMAGE;
    const absoluteImageUrl = getAbsoluteImageUrl(imageUrl);

    // Generate description from horticulturistNotes or fallback
    let description: string;
    if (plant.horticulturistNotes && plant.horticulturistNotes.trim()) {
      description = truncateText(plant.horticulturistNotes, 160);
    } else {
      description = `Explore care tips and requirements for ${plant.name}.`;
    }

    const title = `${plant.name} | Nuvvy Plant Catalog`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${getSiteUrl()}/plantcatalog/${id}`,
        siteName: "Nuvvy",
        images: [
          {
            url: absoluteImageUrl,
            width: 1200,
            height: 630,
            alt: plant.name,
          },
        ],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [absoluteImageUrl],
      },
    };
  } catch (error) {
    console.error("Error generating metadata for plant:", error);
    // Fallback metadata on error
    return {
      title: "Plant | Nuvvy Plant Catalog",
      description: "Explore our curated plant catalog for Bangalore balconies.",
      openGraph: {
        title: "Plant | Nuvvy Plant Catalog",
        description: "Explore our curated plant catalog for Bangalore balconies.",
        url: `${getSiteUrl()}/plantcatalog`,
        siteName: "Nuvvy",
        images: [
          {
            url: getAbsoluteImageUrl(OG_DEFAULT_IMAGE),
            width: 1200,
            height: 630,
            alt: "Nuvvy Plant Catalog",
          },
        ],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: "Plant | Nuvvy Plant Catalog",
        description: "Explore our curated plant catalog for Bangalore balconies.",
        images: [getAbsoluteImageUrl(OG_DEFAULT_IMAGE)],
      },
    };
  }
}

export default function PlantDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
