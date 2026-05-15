import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { extractAsinFromUrl } from "@/lib/catalog/affiliate";

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 6000;
// Amazon serves a stripped page to obvious bot UAs — present as a desktop browser.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Pull out the first matching meta tag content. */
function extractMeta(html: string, property: string): string | null {
  // Try property=... then name=... (Amazon uses property for OG)
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function scrapeOgFromUrl(url: string): Promise<{
  name: string | null;
  image_url: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        // Locale hint helps amazon.in serve the canonical product page
        "Accept-Language": "en-IN,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return { name: null, image_url: null };
    // Amazon pages are large; cap to ~512KB of HTML — OG tags live in <head>.
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return parseOg(text);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    // 1.2MB cap — landingImage often sits past the 500KB mark in Amazon HTML.
    const CAP = 1_200_000;
    while (total < CAP) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    try {
      await reader.cancel();
    } catch {}
    const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    return parseOg(html);
  } catch {
    return { name: null, image_url: null };
  } finally {
    clearTimeout(timeout);
  }
}

function parseOg(html: string): { name: string | null; image_url: string | null } {
  const headEnd = html.indexOf("</head>");
  const head = headEnd >= 0 ? html.slice(0, headEnd) : html;
  const ogTitle = extractMeta(head, "og:title") || extractMeta(head, "twitter:title");
  const titleTag = !ogTitle ? head.match(/<title>([^<]+)<\/title>/i)?.[1] ?? null : null;
  const rawName = ogTitle || titleTag;
  const name = rawName
    ? decodeHtmlEntities(rawName).replace(/\s*:\s*Amazon\.in.*$/i, "").trim() || null
    : null;

  // Image — try OG/Twitter first (sometimes served), then fall back to
  // Amazon's stable body markers. data-old-hires is the highest-res variant.
  let image: string | null =
    extractMeta(head, "og:image") || extractMeta(head, "twitter:image");
  if (!image) {
    image =
      html.match(/id=["']landingImage["'][^>]+data-old-hires=["']([^"']+)["']/i)?.[1] ||
      html.match(/id=["']landingImage["'][^>]+src=["']([^"']+)["']/i)?.[1] ||
      html.match(/id=["']imgBlkFront["'][^>]+(?:data-a-dynamic-image|src)=["']([^"']+)["']/i)?.[1] ||
      // data-a-dynamic-image is a JSON map { "https://...": [w,h], ... };
      // grab the first URL from it
      html.match(/data-a-dynamic-image=["']\{&quot;([^&]+)&quot;/i)?.[1] ||
      html.match(/data-a-dynamic-image=['"]\{"([^"]+)"/i)?.[1] ||
      null;
  }
  if (image) {
    image = decodeHtmlEntities(image);
  }
  return { name, image_url: image ?? null };
}

// POST /api/internal/accessories/asin-lookup
// Body: { url: string }
// Returns: { asin, canonical_url, name, image_url }
// Name and image come from Open Graph scraping (best-effort, may be null).
// Price is NOT returned — Amazon renders price client-side; reliable price
// data requires PA-API which is deferred per PRD OQ-A1.
export async function POST(request: NextRequest) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  let body: { url?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = body?.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const asin = extractAsinFromUrl(url);
  const canonical_url = asin ? `https://www.amazon.in/dp/${asin}` : null;

  // Fire OG scrape against canonical URL when we have one (cleaner page),
  // otherwise against the raw URL the user pasted.
  const fetchUrl = canonical_url || url;
  const og = await scrapeOgFromUrl(fetchUrl);

  return NextResponse.json({
    asin,
    canonical_url,
    name: og.name,
    image_url: og.image_url,
  });
}
