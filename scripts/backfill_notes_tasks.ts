/**
 * One-off: AI-backfill hi/kn for existing internal notes + special tasks that
 * are missing a variant (pending/failed from before the key worked). Idempotent,
 * per-language, never overwrites an existing variant.
 *
 *   npx tsx scripts/backfill_notes_tasks.ts           # dry run
 *   npx tsx scripts/backfill_notes_tasks.ts --apply   # writes
 */
try { require("dotenv").config({ path: ".env.local" }); } catch {}
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.NUVVY_TRANSLATION_MODEL || "gpt-5.4-nano";
const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY || !URL || !SVC) { console.error("Missing env"); process.exit(1); }
const s = createClient(URL, SVC);
const LANG = { hi: "Hindi", kn: "Kannada" } as const;

async function trOnce(text: string, target: "hi" | "kn"): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_completion_tokens: 2048, messages: [
        { role: "system", content: `Translate from English into ${LANG[target]}. Preserve all numbers, units, and chemical/product names exactly. Output ONLY the translation.` },
        { role: "user", content: text },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = (j.choices?.[0]?.message?.content ?? "").trim();
  if (!out) throw new Error("empty");
  return out;
}

// Retry transient 5xx / network blips.
async function tr(text: string, target: "hi" | "kn"): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < 4; i++) {
    try { return await trOnce(text, target); }
    catch (e) { lastErr = e; await new Promise((res) => setTimeout(res, 1500 * (i + 1))); }
  }
  throw lastErr;
}

async function run() {
  let n = 0;
  // Internal notes
  const { data: notes } = await s.from("service_visits")
    .select("id, internal_notes, internal_notes_hi, internal_notes_kn")
    .not("internal_notes", "is", null);
  for (const v of notes ?? []) {
    if (!(v.internal_notes ?? "").trim()) continue;
    const upd: Record<string, unknown> = {};
    if (!v.internal_notes_hi?.trim()) upd.internal_notes_hi = await tr(v.internal_notes, "hi");
    if (!v.internal_notes_kn?.trim()) upd.internal_notes_kn = await tr(v.internal_notes, "kn");
    if (!Object.keys(upd).length) continue;
    const both = (upd.internal_notes_hi ?? v.internal_notes_hi) && (upd.internal_notes_kn ?? v.internal_notes_kn);
    if (both) { upd.internal_notes_translation_status = "done"; upd.internal_notes_translated_at = new Date().toISOString(); }
    console.log(`note "${v.internal_notes.slice(0, 40)}" → ${JSON.stringify(upd).slice(0, 120)}`);
    if (APPLY) await s.from("service_visits").update(upd).eq("id", v.id);
    n++;
  }
  // Special tasks
  const { data: tasks } = await s.from("service_special_tasks")
    .select("id, description, description_hi, description_kn");
  for (const t of tasks ?? []) {
    if (!(t.description ?? "").trim()) continue;
    const upd: Record<string, unknown> = {};
    if (!t.description_hi?.trim()) upd.description_hi = await tr(t.description, "hi");
    if (!t.description_kn?.trim()) upd.description_kn = await tr(t.description, "kn");
    if (!Object.keys(upd).length) continue;
    const both = (upd.description_hi ?? t.description_hi) && (upd.description_kn ?? t.description_kn);
    if (both) { upd.translation_status = "done"; upd.translated_at = new Date().toISOString(); }
    console.log(`task "${t.description.slice(0, 40)}" → ${JSON.stringify(upd).slice(0, 120)}`);
    if (APPLY) await s.from("service_special_tasks").update(upd).eq("id", t.id);
    n++;
  }
  console.log(`\n${APPLY ? "Applied" : "DRY RUN"} — ${n} row(s).`);
}
run().catch((e) => { console.error(e); process.exit(1); });
