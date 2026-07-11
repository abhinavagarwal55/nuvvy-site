import "server-only";
import type { Locale } from "./locales";

// AI translate-on-write wrapper (PRD §8.5). Provider-swappable behind this
// single interface. Current provider: OpenAI Chat Completions over fetch — no
// new dependency (Next.js server runtime has global fetch).
//
// SAFEGUARDS (PRD §8.3, §8.5, mandatory):
//   * The system prompt instructs the model to preserve numbers, units, and
//     chemical names EXACTLY and to output only the translation.
//   * On any failure (missing key, network, refusal, empty) this THROWS. Callers
//     mark translation_status='failed' and the gardener sees the English
//     original — translation must never block the visit.
//
// Scope: ONLY service_special_tasks.description and service_visits.internal_notes.
// Never customers.care_notes, customer_observations, or gardener-authored text.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
// Model is env-overridable so cost/latency can be tuned. Defaults to OpenAI's
// current cheapest small model (gpt-5.4-nano — verified 2026-07; gpt-4o-mini is
// retired). Override with NUVVY_TRANSLATION_MODEL.
const MODEL = process.env.NUVVY_TRANSLATION_MODEL || "gpt-5.4-nano";

const LANG_NAME: Record<Exclude<Locale, "en">, string> = {
  hi: "Hindi",
  kn: "Kannada",
};

function systemPrompt(target: string): string {
  return [
    `You are a translator for a gardening service's field app.`,
    `Translate the user's message from English into ${target}.`,
    `Rules:`,
    `- Preserve all numbers, units (ml, g, L, %, days), dates, and chemical/`,
    `  product names EXACTLY as written — do not translate or convert them.`,
    `- Keep it concise and natural for a gardener to read.`,
    `- Output ONLY the translated text. No preamble, quotes, or notes.`,
  ].join("\n");
}

/**
 * Translate `text` into the target locale ('hi' | 'kn'). Throws on any failure.
 */
export async function translateText(
  text: string,
  targetLang: Exclude<Locale, "en">
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set — translation unavailable");

  const source = text.trim();
  if (!source) throw new Error("Nothing to translate");

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt(LANG_NAME[targetLang]) },
        { role: "user", content: source },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Translation API ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | null; refusal?: string | null };
    }>;
  };
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new Error("Translation refused");
  if (choice?.finish_reason === "content_filter") throw new Error("Translation blocked");

  const out = (choice?.message?.content ?? "").trim();
  if (!out) throw new Error("Empty translation");
  return out;
}

export type TranslationOutcome =
  | { status: "done"; hi: string; kn: string }
  | { status: "failed" };

/**
 * Translate into both hi + kn. Returns 'done' with both variants, or 'failed'
 * if either translation errors (caller then serves the English original).
 */
export async function translateToHiKn(text: string): Promise<TranslationOutcome> {
  try {
    const [hi, kn] = await Promise.all([
      translateText(text, "hi"),
      translateText(text, "kn"),
    ]);
    return { status: "done", hi, kn };
  } catch {
    return { status: "failed" };
  }
}
