import { NextRequest, NextResponse } from "next/server";
import { listPlantsFromSupabase } from "@/lib/catalog/supabasePlantStore";
import { toErrorMessage } from "@/lib/utils/errors";

// Server-side API route for listing plants
// Uses ISR caching: revalidates every 5 minutes (300 seconds)
// Reads from Supabase (not Airtable)
export async function GET(req: NextRequest) {
  try {
    const plants = await listPlantsFromSupabase();

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
    console.error("Error fetching plants:", toErrorMessage(error));
    return NextResponse.json({ error: "Failed to fetch plants", plants: [] }, { status: 500 });
  }
}
