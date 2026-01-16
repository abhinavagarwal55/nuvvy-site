import { NextRequest, NextResponse } from "next/server";
import { listPlantsFromSupabase } from "@/lib/catalog/supabasePlantStore";
import { toErrorMessage } from "@/lib/utils/errors";

// Force dynamic rendering - no caching
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Server-side API route for listing plants
// No caching: always fetches fresh data from Supabase
// Reads from Supabase (not Airtable)
export async function GET(req: NextRequest) {
  try {
    const plants = await listPlantsFromSupabase();

    return NextResponse.json(
      { plants },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching plants:", toErrorMessage(error));
    return NextResponse.json({ error: "Failed to fetch plants", plants: [] }, { status: 500 });
  }
}
