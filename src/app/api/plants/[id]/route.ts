import { NextRequest, NextResponse } from "next/server";
import { getPlantDetailFromSupabaseByAirtableId } from "@/lib/catalog/supabasePlantStore";

// Server-side API route for getting a single plant by ID
// Uses ISR caching: revalidates every hour (3600 seconds)
// Reads from Supabase (not Airtable)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plant = await getPlantDetailFromSupabaseByAirtableId(id);

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
