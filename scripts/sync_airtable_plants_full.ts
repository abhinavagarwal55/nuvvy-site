/**
 * One-time Airtable → Supabase full sync script for Plants catalog
 * 
 * Usage:
 *   DRY_RUN=true npx tsx scripts/sync_airtable_plants_full.ts
 *   npx tsx scripts/sync_airtable_plants_full.ts
 * 
 * Environment variables required:
 *   - AIRTABLE_API_KEY
 *   - AIRTABLE_BASE_ID
 *   - AIRTABLE_PLANTS_TABLE (defaults to "Plants")
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - DRY_RUN (optional; if "true" do not write to database)
 * 
 * Note: If dotenv is installed, it will load .env.local automatically.
 * Otherwise, ensure environment variables are set in your shell.
 */

// Try to load dotenv if available (optional dependency)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require("dotenv");
  dotenv.config({ path: ".env.local" });
} catch {
  // dotenv not installed, continue without it
  // Environment variables must be set in shell or process.env
}

import { createClient } from "@supabase/supabase-js";

// Types
interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

interface SupabasePlantRow {
  airtable_id: string;
  name: string;
  scientific_name?: string | null;
  category: string;
  light: string;
  watering_requirement?: string | null;
  toxicity?: string | null;
  horticulturist_notes?: string | null;
  fertilization_requirement?: string | null;
  soil_mix?: string | null;
  lifespan?: string | null;
  can_be_procured?: boolean | null;
  price_band?: string | null;
  procurement_notes?: string | null;
  air_purifier: boolean;
  sync_status: string;
  last_synced_at: string;
}

// Helper: Convert Airtable Yes/No to boolean
function parseBoolean(value: unknown, defaultValue: boolean = false): boolean {
  if (value === true || value === "true" || value === "Yes" || value === "yes" || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === "No" || value === "no" || value === "0") {
    return false;
  }
  return defaultValue;
}

// Helper: Convert Airtable Yes/No to boolean | null (for nullable fields)
function parseBooleanOrNull(value: unknown): boolean | null {
  if (value === true || value === "true" || value === "Yes" || value === "yes" || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === "No" || value === "no" || value === "0") {
    return false;
  }
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return null;
}

// Helper: Convert value to string or null
function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  return String(value);
}

// Fetch all Airtable records with pagination
async function fetchAllAirtableRecords(
  apiKey: string,
  baseId: string,
  tableName: string
): Promise<AirtableRecord[]> {
  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;
  let pageNumber = 1;
  const maxPages = 100; // Safety limit

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableName}`);
    url.searchParams.set("pageSize", "100");
    if (offset) {
      url.searchParams.set("offset", offset);
    }

    console.log(`[Airtable] Fetching page ${pageNumber}...`);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Airtable API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as AirtableResponse;
    allRecords.push(...data.records);
    console.log(`[Airtable] Fetched ${data.records.length} records (total: ${allRecords.length})`);

    offset = data.offset;
    pageNumber++;

    if (pageNumber > maxPages) {
      console.warn(`[Airtable] Reached maxPages limit (${maxPages}). Stopping pagination.`);
      break;
    }
  } while (offset);

  console.log(`[Airtable] Total records fetched: ${allRecords.length}`);
  return allRecords;
}

// Map Airtable record to Supabase row
function mapAirtableToSupabase(record: AirtableRecord): SupabasePlantRow | null {
  const fields = record.fields;

  // Required field: Plant Name
  const name = fields["Plant Name"];
  if (!name || typeof name !== "string" || name.trim() === "") {
    console.warn(`[Mapping] Skipping record ${record.id}: missing Plant Name`);
    return null;
  }

  return {
    airtable_id: record.id,
    name: name.trim(),
    scientific_name: toStringOrNull(fields["Scientific Name"]),
    category: toStringOrNull(fields["Category"]) || "Indoor plant", // Default fallback
    light: toStringOrNull(fields["Light Requirement"]) || "Bright indirect", // Default fallback
    watering_requirement: toStringOrNull(fields["Watering Requirement"]),
    toxicity: toStringOrNull(fields["Toxicity"]),
    horticulturist_notes: toStringOrNull(fields["Horticulturist Notes"]),
    fertilization_requirement: toStringOrNull(fields["Fertilization Requirement"]),
    soil_mix: toStringOrNull(fields["Soil Mix"]),
    lifespan: toStringOrNull(fields["Lifespan"]),
    can_be_procured: parseBooleanOrNull(fields["Can be procured?"]),
    price_band: toStringOrNull(fields["Price Band"]),
    procurement_notes: toStringOrNull(fields["Procurement Notes"]),
    air_purifier: parseBoolean(fields["Air Purifier"], false), // Default to false
    sync_status: "synced",
    last_synced_at: new Date().toISOString(),
  };
}

// Main sync function
async function syncAirtableToSupabase() {
  // Validate environment variables
  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID;
  const airtableTableName = process.env.AIRTABLE_PLANTS_TABLE || "Plants";
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = process.env.DRY_RUN === "true";

  if (!airtableApiKey || !airtableBaseId) {
    throw new Error("Missing required environment variables: AIRTABLE_API_KEY and AIRTABLE_BASE_ID");
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  console.log("=".repeat(60));
  console.log("Airtable → Supabase Full Sync Script");
  console.log("=".repeat(60));
  console.log(`Airtable Base: ${airtableBaseId}`);
  console.log(`Airtable Table: ${airtableTableName}`);
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`DRY RUN: ${dryRun ? "YES (no writes)" : "NO (will write)"}`);
  console.log("=".repeat(60));
  console.log();

  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Fetch all Airtable records
  console.log("[Step 1] Fetching all records from Airtable...");
  const airtableRecords = await fetchAllAirtableRecords(airtableApiKey, airtableBaseId, airtableTableName);
  const airtableFetched = airtableRecords.length;

  if (airtableFetched === 0) {
    console.warn("[Warning] No records fetched from Airtable. Exiting.");
    return;
  }

  // Map Airtable records to Supabase rows
  console.log();
  console.log("[Step 2] Mapping Airtable records to Supabase format...");
  const supabaseRows: SupabasePlantRow[] = [];
  for (const record of airtableRecords) {
    const mapped = mapAirtableToSupabase(record);
    if (mapped) {
      supabaseRows.push(mapped);
    }
  }

  console.log(`[Mapping] Successfully mapped ${supabaseRows.length} records (skipped ${airtableFetched - supabaseRows.length})`);

  if (supabaseRows.length === 0) {
    console.warn("[Warning] No valid records to sync. Exiting.");
    return;
  }

  // Batch upsert to Supabase
  console.log();
  console.log(`[Step 3] ${dryRun ? "[DRY RUN] Would upsert" : "Upserting"} records to Supabase...`);

  const batchSize = 200;
  let attemptedUpserts = 0;
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (let i = 0; i < supabaseRows.length; i += batchSize) {
    const batch = supabaseRows.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(supabaseRows.length / batchSize);

    console.log(`[Upsert] Processing batch ${batchNumber}/${totalBatches} (${batch.length} records)...`);

    if (dryRun) {
      // In dry run, just count what would be upserted
      attemptedUpserts += batch.length;
      successCount += batch.length;
      console.log(`[DRY RUN] Would upsert ${batch.length} records`);
    } else {
      // Actual upsert
      const { data, error } = await supabase
        .from("plants")
        .upsert(batch, {
          onConflict: "airtable_id",
        });

      if (error) {
        console.error(`[Upsert] Batch ${batchNumber} error:`, error.message);
        errorCount += batch.length;
        for (const row of batch) {
          errors.push({ id: row.airtable_id, error: error.message });
        }
      } else {
        attemptedUpserts += batch.length;
        successCount += batch.length;
        console.log(`[Upsert] Batch ${batchNumber} successful: ${batch.length} records`);
      }
    }
  }

  // Get final count of synced plants
  let finalSyncedCount = 0;
  if (!dryRun) {
    console.log();
    console.log("[Step 4] Counting synced plants in Supabase...");
    const { count, error } = await supabase
      .from("plants")
      .select("*", { count: "exact", head: true })
      .eq("sync_status", "synced");

    if (error) {
      console.warn(`[Count] Error counting synced plants: ${error.message}`);
    } else {
      finalSyncedCount = count || 0;
    }
  }

  // Print summary
  console.log();
  console.log("=".repeat(60));
  console.log("SYNC SUMMARY");
  console.log("=".repeat(60));
  console.log(`Airtable records fetched: ${airtableFetched}`);
  console.log(`Records mapped: ${supabaseRows.length}`);
  console.log(`Attempted upserts: ${attemptedUpserts}`);
  console.log(`Successful upserts: ${successCount}`);
  console.log(`Failed upserts: ${errorCount}`);

  if (errors.length > 0) {
    console.log();
    console.log("Sample errors (first 5):");
    errors.slice(0, 5).forEach((err) => {
      console.log(`  - ${err.id}: ${err.error}`);
    });
    if (errors.length > 5) {
      console.log(`  ... and ${errors.length - 5} more errors`);
    }
  }

  if (!dryRun && finalSyncedCount > 0) {
    console.log();
    console.log(`Final count of plants with sync_status='synced': ${finalSyncedCount}`);
  }

  console.log("=".repeat(60));

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run the sync
syncAirtableToSupabase().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
