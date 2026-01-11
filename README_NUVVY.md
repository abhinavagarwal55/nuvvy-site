# 🌿 Nuvvy — Brand & Design Guide

**One-liner:**  
Nuvvy transforms balconies into lush, low-effort green sanctuaries.

---

## 🎯 Brand Essence
- **Primary vibe:** Fresh · Comfortable · Designed  
- **Secondary themes:** Entertaining friends · Premium · Family-friendly  
- **Emotion:** Feels like stepping into calm nature, but designed beautifully.  

---

## 🌈 Visual Language
- **Style:** Minimal Scandinavian × Tropical Luxe  
- **Colors (from Tailwind tokens):**  
  - Leaf `#22A559` → Primary green (growth, freshness)  
  - Fern `#0EA5A3` → Secondary aqua (balance, life)  
  - Butter `#F6F2E9` → Warm cream background  
  - Ink `#1F2937` → Text and contrast color  
  - Cane `#D4B996` → Natural wood / rattan accent  
  - Mist `#EEF6F1` → Subtle background neutral  

- **Texture:** matte finishes, soft shadows, gentle gradients.  
- **Icons:** line-style, minimal, organic shapes.  
- **Photography:** daylight shots, greenery, cozy corners, natural materials.

---

## ✍️ Voice & Tone
- **Personality:** Trustworthy · Passionate about nature · Friendly · Helpful  
- **Copy style:**  
  - Speak like a warm, helpful friend who loves plants.  
  - Avoid jargon or corporate tone.  
  - Be positive, sensory, and grounded.  
  - Use short sentences.  

**Examples:**  
> “Turn your balcony into a green sanctuary.”  
> “We design spaces that breathe.”  
> “Beautiful, low-effort greenery for city homes.”

---

## 🧩 Design & Implementation Notes
- **Framework:** Next.js 15 with App Router  
- **Styling:** TailwindCSS (use semantic tokens like `bg-butter`, `text-ink`, `shadow-card`)  
- **Layout:** container width 1120px, generous padding, rounded-2xl corners  
- **Fonts:** Inter (body), Plus Jakarta Sans (headings)  
- **Tone:** calm, premium, but friendly. Avoid overexcited marketing tone.  
- **Animations:** subtle fade or slide; nothing bouncy or flashy.  

---

## 👥 Audience
Urban professionals and young families in Indian metros (especially apartments with balconies).  
They want a place to relax, host friends, or have their kids play safely — but don’t want to maintain a full garden.

---

## 🧠 How to use this
- Cursor should read this before generating any copy, component, or layout.  
- When creating new sections, stay consistent with this vibe.  
- For CTAs, use helpful verbs like “See examples,” “Get a free mockup,” “Talk to us.”

---

## ⚙️ Environment Variables

### Plant Catalog (Airtable Integration)
To use Airtable as the data source for the Plant Catalog, add these variables to `.env.local`:

```bash
AIRTABLE_API_KEY=your_airtable_api_key_here
AIRTABLE_BASE_ID=your_airtable_base_id_here
AIRTABLE_PLANTS_TABLE=Plants
```

**Note:** If these variables are not set, the catalog will use mock data. See `.env.example` for a template.

To get your Airtable credentials:
1. API Key: Go to https://airtable.com/account → Personal access tokens
2. Base ID: Found in your Airtable base URL or API documentation
3. Table name: Defaults to "Plants" if not specified

### Site URL (Open Graph Metadata)
For proper Open Graph and Twitter card previews on social media (WhatsApp, Facebook, Twitter), add this to `.env.local`:

```bash
NEXT_PUBLIC_SITE_URL=https://www.nuvvy.in
```

**Note:** 
- For local development, use `http://localhost:3000`
- For production, use your actual domain (e.g., `https://www.nuvvy.in`)
- If not set, defaults to `http://localhost:3000` in development or `https://www.nuvvy.in` in production
- This ensures absolute URLs for OG images and metadata

### Plant Catalog Sync (Supabase)
The plant catalog reads from Supabase, not Airtable directly. To sync plants from Airtable to Supabase:

```bash
curl -X POST http://localhost:3000/api/admin/sync-plants \
  -H "x-admin-secret: your_admin_sync_secret_here"
```

**Required environment variables:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for server-side writes)
- `ADMIN_SYNC_SECRET` - Secret key for authenticating sync requests

**Note:** The sync endpoint fetches all plants from Airtable and upserts them into Supabase using `airtable_id` as the unique key. This ensures the website can work even if Airtable is temporarily unavailable.
