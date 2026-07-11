/**
 * One-off: AI-backfill hi/kn translations for existing checklist items and
 * care actions that are missing them. Idempotent — only fills rows where a
 * variant is null. Mirrors the app's translate-on-write (same prompt/model).
 *
 *   npx tsx scripts/backfill_translations.ts            # dry run (no writes)
 *   npx tsx scripts/backfill_translations.ts --apply    # writes
 *
 * Requires OPENAI_API_KEY + SUPABASE creds in .env.local.
 */
try { require("dotenv").config({ path: ".env.local" }); } catch {}
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.NUVVY_TRANSLATION_MODEL || "gpt-5.4-nano";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!OPENAI_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing OPENAI_API_KEY / SUPABASE creds in .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const LANG = { hi: "Hindi", kn: "Kannada" } as const;

async function translate(text: string, target: "hi" | "kn"): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: `Translate the user's message from English into ${LANG[target]}. Preserve all numbers, units, and chemical/product names exactly. Output ONLY the translated text.`,
        },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = (j.choices?.[0]?.message?.content ?? "").trim();
  if (!out) throw new Error("empty");
  return out;
}

async function run() {
  let filled = 0;

  // 1. Checklist template items (active, missing a variant).
  const { data: items } = await supabase
    .from("checklist_template_items")
    .select("id, label, label_hi, label_kn")
    .eq("is_active", true)
    .order("order_index");
  for (const it of items ?? []) {
    // Only fill the MISSING language — never overwrite an existing translation.
    const upd: Record<string, unknown> = {};
    if (!it.label_hi?.trim()) upd.label_hi = await translate(it.label, "hi");
    if (!it.label_kn?.trim()) upd.label_kn = await translate(it.label, "kn");
    if (Object.keys(upd).length === 0) continue;
    console.log(`checklist "${it.label.slice(0, 40)}" → ${JSON.stringify(upd)}`);
    if (APPLY) {
      // Clear the review flag only once both variants are present.
      const bothPresent = (upd.label_hi ?? it.label_hi) && (upd.label_kn ?? it.label_kn);
      if (bothPresent) upd.needs_translation_review = false;
      await supabase.from("checklist_template_items").update(upd).eq("id", it.id);
    }
    filled++;
  }

  // 2. Care action types (missing a display_name variant).
  const { data: types } = await supabase
    .from("care_action_types")
    .select("id, name, display_name, display_name_hi, display_name_kn")
    .order("name");
  for (const t of types ?? []) {
    const en = t.display_name ?? t.name;
    // Only fill the MISSING language — never overwrite an existing translation.
    const upd: Record<string, unknown> = {};
    if (!t.display_name_hi?.trim()) upd.display_name_hi = await translate(en, "hi");
    if (!t.display_name_kn?.trim()) upd.display_name_kn = await translate(en, "kn");
    if (Object.keys(upd).length === 0) continue;
    console.log(`care "${en}" → ${JSON.stringify(upd)}`);
    if (APPLY) {
      const bothPresent = (upd.display_name_hi ?? t.display_name_hi) && (upd.display_name_kn ?? t.display_name_kn);
      if (bothPresent) upd.needs_translation_review = false;
      await supabase.from("care_action_types").update(upd).eq("id", t.id);
    }
    filled++;
  }

  console.log(`\n${APPLY ? "Applied" : "DRY RUN"} — ${filled} row(s) ${APPLY ? "updated" : "would be translated"}.`);
}
run().catch((e) => { console.error(e); process.exit(1); });
