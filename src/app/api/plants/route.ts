import { NextRequest, NextResponse } from "next/server";
import { createAirtableStore } from "@/lib/catalog/airtableStore";
import { mockCatalogStore } from "@/lib/catalog/mockStore";

// Server-side API route for listing plants
// Uses ISR caching: revalidates every 5 minutes (300 seconds)
export async function GET(req: NextRequest) {
  try {
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

    const plants = await store.listPlants();

    return NextResponse.json(
      { plants },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching plants:", error);
    return NextResponse.json({ error: "Failed to fetch plants", plants: [] }, { status: 500 });
  }
}
