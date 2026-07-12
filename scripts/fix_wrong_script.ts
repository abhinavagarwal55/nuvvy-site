/**
 * Repair translations that came back in the wrong script (e.g. Korean/Tamil in a
 * Kannada field). Scans all translated tables; re-translates the offending
 * variant with validation + retries; if a clean result can't be produced, NULLs
 * the variant so it falls back to the English original (never shows garbage).
 *
 *   npx tsx scripts/fix_wrong_script.ts           # dry run
 *   npx tsx scripts/fix_wrong_script.ts --apply
 */
try { require("dotenv").config({ path: ".env.local" }); } catch {}
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const KEY = process.env.OPENAI_API_KEY!;
const MODEL = process.env.NUVVY_TRANSLATION_MODEL || "gpt-5.4-nano";
const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!KEY || !URL || !SVC) { console.error("Missing env"); process.exit(1); }
const s = createClient(URL, SVC);

const DEVA = /[ऀ-ॿ]/, KAN = /[ಀ-೿]/;
const LANG = { hi: "Hindi", kn: "Kannada" } as const;

// Whitelist: only the target Indic block + Latin + digits + punctuation allowed.
function ok(text: string, target: "hi" | "kn"): boolean {
  const block = target === "hi" ? DEVA : KAN;
  const lo = target === "hi" ? 0x0900 : 0x0c80;
  const hi = target === "hi" ? 0x097f : 0x0cff;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0x024f) continue;
    if (cp >= 0x2000 && cp <= 0x206f) continue;
    if (cp === 0x0964 || cp === 0x0965) continue;
    if (cp >= lo && cp <= hi) continue;
    return false;
  }
  return block.test(text);
}

async function callOnce(text: string, target: "hi" | "kn"): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_completion_tokens: 2048, messages: [
      { role: "system", content: `Translate from English into ${LANG[target]}. Respond using ONLY the ${LANG[target]} script — never Korean, Chinese, Tamil, or any other script (English brand/chemical names in Latin letters are fine). Preserve numbers, units, and chemical/product names exactly. Output ONLY the translation.` },
      { role: "user", content: text }] }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (j.choices?.[0]?.message?.content ?? "").trim();
}

// Returns a clean translation, or null if it can't produce one after retries.
async function translate(text: string, target: "hi" | "kn"): Promise<string | null> {
  for (let i = 0; i < 4; i++) {
    try {
      const out = await callOnce(text, target);
      if (out && ok(out, target)) return out;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
  }
  return null;
}

type Spec = { table: string; textKey: string; hiKey: string; knKey: string; extraNull?: Record<string, unknown> };
const SPECS: Spec[] = [
  { table: "service_special_tasks", textKey: "description", hiKey: "description_hi", knKey: "description_kn", extraNull: { translation_status: "failed" } },
  { table: "service_visits", textKey: "internal_notes", hiKey: "internal_notes_hi", knKey: "internal_notes_kn", extraNull: { internal_notes_translation_status: "failed" } },
  { table: "checklist_template_items", textKey: "label", hiKey: "label_hi", knKey: "label_kn", extraNull: { needs_translation_review: true } },
  { table: "care_action_types", textKey: "display_name", hiKey: "display_name_hi", knKey: "display_name_kn", extraNull: { needs_translation_review: true } },
  { table: "service_guidelines", textKey: "text", hiKey: "text_hi", knKey: "text_kn", extraNull: { translation_status: "failed" } },
];

async function run() {
  let fixed = 0, nulled = 0;
  for (const sp of SPECS) {
    const { data } = await s.from(sp.table).select(`id, ${sp.textKey}, ${sp.hiKey}, ${sp.knKey}`);
    for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
      const en = (row[sp.textKey] ?? "").toString();
      if (!en.trim()) continue;
      for (const [key, target] of [[sp.hiKey, "hi"], [sp.knKey, "kn"]] as const) {
        const val = (row[key] ?? "").toString();
        if (!val.trim() || ok(val, target)) continue; // empty or already fine
        const clean = await translate(en, target);
        if (clean) {
          console.log(`FIX ${sp.table}.${key} "${en.slice(0, 30)}" → "${clean.slice(0, 40)}"`);
          if (APPLY) await s.from(sp.table).update({ [key]: clean }).eq("id", row.id);
          fixed++;
        } else {
          console.log(`NULL ${sp.table}.${key} "${en.slice(0, 30)}" (couldn't get clean ${target}) → English fallback`);
          if (APPLY) await s.from(sp.table).update({ [key]: null, ...(sp.extraNull ?? {}) }).eq("id", row.id);
          nulled++;
        }
      }
    }
  }
  console.log(`\n${APPLY ? "Applied" : "DRY RUN"} — fixed=${fixed}, nulled(→English)=${nulled}`);
}
run().catch((e) => { console.error(e); process.exit(1); });
