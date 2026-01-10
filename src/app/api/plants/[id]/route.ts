import { NextRequest, NextResponse } from "next/server";
import { createAirtableStore } from "@/lib/catalog/airtableStore";
import { mockCatalogStore } from "@/lib/catalog/mockStore";

// Server-side API route for getting a single plant by ID
// Uses ISR caching: revalidates every hour (3600 seconds)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const hasAirtableConfig =
      process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID;

    let store = mockCatalogStore;

    if (hasAirtableConfig) {
      try {
        store = createAirtableStore();
      } catch (error) {
        console.error("Failed to create Airtable store, falling back to mock:", error);
        store = mockCatalogStore;
      }
    }

    const plant = await store.getPlantById(id);

    if (!plant) {
      return NextResponse.json({ error: "Plant not found" }, { status: 404 });
    }

    return NextResponse.json(
      { plant },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching plant:", error);
    return NextResponse.json({ error: "Failed to fetch plant", plant: null }, { status: 500 });
  }
}
