/**
 * Backfill customers.unit_number from the free-text customers.address.
 *
 * The address field is inconsistent free text, so this is deliberately a
 * TWO-PHASE, human-confirmed process — never a blind overwrite (per the Society
 * & Unit PRD, backfill must be "human-confirmed, never auto-committed"):
 *
 *   1. DRY RUN (default) — proposes a unit for each customer that has an address
 *      but no unit_number, and writes a review CSV. Nothing is written to the DB.
 *
 *        npx tsx scripts/backfill_customer_units.ts
 *        # → writes scripts/unit-backfill-proposals.csv
 *
 *      Open the CSV, check the `proposed_unit` / `confidence` columns, and edit
 *      the `approved_unit` column: keep/adjust the ones you want, blank out the
 *      ones you don't. Low-confidence rows start with an EMPTY approved_unit on
 *      purpose — you must type a value to accept them.
 *
 *   2. APPLY — writes ONLY rows whose `approved_unit` is non-empty, and only
 *      where the customer still has no unit_number (never overwrites existing
 *      data). Each write also inserts an audit_logs row.
 *
 *        npx tsx scripts/backfill_customer_units.ts --apply scripts/unit-backfill-proposals.csv
 *
 * Env (loaded from .env.local if dotenv is present):
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config({ path: ".env.local" });
} catch {
  // dotenv optional — rely on shell env
}

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_CSV = "scripts/unit-backfill-proposals.csv";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env (.env.local).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type Confidence = "high" | "low";
type Proposal = { unit: string; confidence: Confidence; rule: string };

/**
 * Extract a candidate unit from a free-text address.
 * Returns null when no number-like token is present.
 */
export function extractUnit(addressRaw: string): Proposal | null {
  const a = addressRaw.trim();
  if (!a) return null;

  // 1. Villa / Plot — keep the label so "Villa 24" stays meaningful.
  let m = a.match(/\b(villa|plot)\b[\s#.:,-]*([0-9]{1,4}[A-Za-z]?)/i);
  if (m) {
    const label = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    return { unit: `${label} ${m[2].toUpperCase()}`, confidence: "high", rule: "villa/plot" };
  }

  // 2. Apt / Apartment / Flat / Unit label followed by a 2–5 digit flat number.
  m = a.match(/\b(?:apt|apartment|flat|unit)\b\.?[\s#.:,-]*([A-Za-z]?[0-9]{2,5}[A-Za-z]?)/i);
  if (m) return { unit: m[1].toUpperCase(), confidence: "high", rule: "apt-label" };

  // 3. Whole-string society code, e.g. "PWM-2112", "WoYM-3033", "PWM 4123".
  m = a.match(/^([A-Za-z]{2,6})[-\s]?([0-9]{2,5})$/);
  if (m) return { unit: m[2].toUpperCase(), confidence: "high", rule: "society-code" };

  // 4. Bare number, e.g. "45" or "#801".
  m = a.match(/^\s*#?\s*([0-9]{1,5})\s*$/);
  if (m) return { unit: m[1], confidence: "high", rule: "bare-number" };

  // 5. Hash number inside a longer street address, e.g. "#801 (West gate), ...".
  m = a.match(/#\s*([0-9]{1,5})/);
  if (m) return { unit: `#${m[1]}`, confidence: "low", rule: "hash-in-street" };

  // 6. Single-letter prefix, e.g. "V - 24" (villa? ambiguous).
  m = a.match(/^\s*([A-Za-z])[\s-]+([0-9]{1,4})\s*$/);
  if (m) return { unit: m[2], confidence: "low", rule: "single-letter" };

  return null;
}

/* ---------- Minimal RFC-4180-ish CSV helpers ---------- */

function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch === "\r") { /* ignore */ }
    else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

/* ---------- Phases ---------- */

type CustomerRow = { id: string; name: string; address: string | null; unit_number: string | null };

async function fetchCandidates(): Promise<CustomerRow[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, address, unit_number")
    .not("address", "is", null);
  if (error) throw new Error(error.message);
  // Only rows with a real address AND no existing unit (never overwrite).
  return (data ?? []).filter(
    (c) => (c.address ?? "").trim() !== "" && (c.unit_number ?? "").trim() === ""
  ) as CustomerRow[];
}

async function dryRun(csvPath: string) {
  const candidates = await fetchCandidates();
  const header = ["customer_id", "name", "address", "proposed_unit", "confidence", "approved_unit"];
  const rows: string[][] = [header];
  let high = 0, low = 0, none = 0;

  for (const c of candidates) {
    const p = extractUnit(c.address ?? "");
    if (!p) {
      none++;
      rows.push([c.id, c.name ?? "", c.address ?? "", "", "none", ""]);
      continue;
    }
    if (p.confidence === "high") high++; else low++;
    // Pre-fill approved_unit only for HIGH confidence — low-confidence must be
    // explicitly accepted by a human.
    const approved = p.confidence === "high" ? p.unit : "";
    rows.push([c.id, c.name ?? "", c.address ?? "", p.unit, p.confidence, approved]);
  }

  fs.writeFileSync(csvPath, toCsv(rows), "utf8");
  console.log(`DRY RUN — no database writes.`);
  console.log(`Candidates (address present, unit empty): ${candidates.length}`);
  console.log(`  high-confidence proposals : ${high}  (pre-approved in CSV)`);
  console.log(`  low-confidence proposals  : ${low}   (approved_unit left blank — review)`);
  console.log(`  no unit found in address  : ${none}`);
  console.log(`\nReview file written to: ${csvPath}`);
  console.log(`Edit the approved_unit column, then:`);
  console.log(`  npx tsx scripts/backfill_customer_units.ts --apply ${csvPath}`);
}

async function apply(csvPath: string) {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}. Run the dry run first.`);
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const header = rows.shift();
  if (!header) { console.error("Empty CSV."); process.exit(1); }
  const idx = (k: string) => header.indexOf(k);
  const iId = idx("customer_id"), iApproved = idx("approved_unit");
  if (iId < 0 || iApproved < 0) {
    console.error("CSV must have customer_id and approved_unit columns.");
    process.exit(1);
  }

  const toWrite = rows
    .filter((r) => r.length > iId && (r[iApproved] ?? "").trim() !== "")
    .map((r) => ({ id: r[iId].trim(), unit: r[iApproved].trim() }));

  console.log(`Rows with an approved_unit: ${toWrite.length}`);
  let updated = 0, skipped = 0, failed = 0;

  for (const { id, unit } of toWrite) {
    // Re-check the customer still has no unit — never overwrite existing data.
    const { data: current, error: readErr } = await supabase
      .from("customers")
      .select("id, unit_number")
      .eq("id", id)
      .single();
    if (readErr || !current) { failed++; console.warn(`  ! ${id}: not found`); continue; }
    if ((current.unit_number ?? "").trim() !== "") {
      skipped++;
      console.log(`  - ${id}: already has unit "${current.unit_number}" — skipped`);
      continue;
    }

    const { error: updErr } = await supabase
      .from("customers")
      .update({ unit_number: unit })
      .eq("id", id);
    if (updErr) { failed++; console.warn(`  ! ${id}: ${updErr.message}`); continue; }

    await supabase.from("audit_logs").insert({
      actor_id: null,
      actor_role: "system",
      action: "customer.unit_backfilled",
      target_table: "customers",
      target_id: id,
      metadata: { unit_number: unit, source: "backfill_customer_units.ts" },
    });
    updated++;
    console.log(`  ✓ ${id}: unit_number = "${unit}"`);
  }

  console.log(`\nApplied. updated=${updated} skipped(existing)=${skipped} failed=${failed}`);
}

/* ---------- Entry ---------- */

async function main() {
  const args = process.argv.slice(2);
  const applyIdx = args.indexOf("--apply");
  if (applyIdx >= 0) {
    const csvPath = args[applyIdx + 1] || DEFAULT_CSV;
    await apply(csvPath);
  } else {
    await dryRun(DEFAULT_CSV);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
