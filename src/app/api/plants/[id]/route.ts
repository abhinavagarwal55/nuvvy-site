import { NextRequest, NextResponse } from "next/server";
import { getPlantDetailFromSupabaseByAirtableId } from "@/lib/catalog/supabasePlantStore";

// Force dynamic rendering - no caching
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Server-side API route for getting a single plant by ID
// No caching: always fetches fresh data from Supabase
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
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching plant:", error);
    return NextResponse.json({ error: "Failed to fetch plant", plant: null }, { status: 500 });
  }
}
