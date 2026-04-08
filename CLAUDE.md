# Nuvvy Site — Claude Context

This is the production codebase for **nuvvy.in**, a balcony gardening service in India.
It is a Next.js 15 app with two distinct surfaces: a public marketing site and an internal CMS/ops tool.

---

## Dev Commands

```bash
npm run dev        # Start dev server with Turbopack (localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npm run share      # Start dev server + ngrok tunnel (for sharing with clients)
```

---

## Tech Stack

- **Framework:** Next.js 15 (App Router, React 19)
- **Styling:** TailwindCSS 3 — use semantic tokens: `bg-butter`, `text-ink`, `bg-mist`, etc.
- **Database & Auth:** Supabase (Postgres + SSR auth + Storage)
- **Validation:** Zod
- **Icons:** lucide-react

---

## Architecture Overview

### Two surfaces, one codebase

| Surface | URL (prod) | Local path |
|---|---|---|
| Public site | `nuvvy.in` | `src/app/(public)/` |
| Internal CMS | `internal.nuvvy.in` | `src/app/(internal)/internal/` |

In **production**, subdomain routing is handled in `src/middleware.ts`:
- `internal.nuvvy.in` → rewrites to `/internal/*`
- `/internal` routes are blocked from the public domain

In **development**, both surfaces are accessible directly on `localhost:3000`:
- `localhost:3000/` → public site
- `localhost:3000/internal` → internal CMS (auth bypass available for dev)

### Internal CMS auth
The internal tool uses Supabase email auth. In dev, auth can be bypassed via the `isDevBypassAuthMiddleware` flag in `src/lib/internal/dev-bypass.ts`. The `/api/internal/*` routes are also protected and return 404 on the public domain.

---

## Key Features

### 1. Homepage (CMS-driven)
- Homepage content is stored as **JSONB in the `homepage_content` Supabase table**.
- The schema is defined in `src/lib/schemas/homepage.schema.ts` (Zod) — this is the source of truth for what fields exist.
- Content is edited via the internal CMS at `/internal/homepage`.
- The public homepage is rendered by `src/app/(public)/HomepageRenderer.tsx`.
- The page is `force-dynamic` (no static generation).

**Hero variants** (configured in `src/config/homepage.ts`):
- `"snabbit"` — currently active
- `"classic"` — legacy carousel

**Feature flags** (also in `src/config/homepage.ts`):
- `showCompareSection: false` — the compare section is currently hidden

### 2. Plant Catalog
- Plants are stored in Supabase (`plants` table).
- Primary data source: **Supabase** (`src/lib/catalog/supabasePlantStore.ts`)
- Legacy/fallback stores also exist: Airtable, API, mock (`src/lib/catalog/`)
- Public catalog at `/plantcatalog` and `/plantcatalog/[id]`
- Plant images stored in Supabase Storage; `thumbnail_storage_url` preferred over `thumbnail_url`

### 3. Shortlists System
A significant internal feature for creating curated plant shortlists for customers:
- Internal management: `/internal/shortlists`
- Full versioning system (create version, revise, publish, move to procurement)
- **Public share link** for customers: `/s/[token]` — customers can view and finalize their shortlist
- API routes: `/api/internal/shortlists/[id]/*` and `/api/shortlists/public/[token]/*`

### 4. Pricing
- Pricing is **code-owned**, not CMS-editable.
- Source: `src/config/pricing.ts`
- Current tiers: 0–20 pots (₹799/mo), 20–40 pots (₹1099/mo), 40+ pots (custom)

### 5. WhatsApp CTAs
- WhatsApp number from env: `NEXT_PUBLIC_WHATSAPP_NUMBER`
- Pre-written message templates in `src/config/whatsapp.ts`
- Use `getWhatsAppLink(message)` to generate deep links

### 6. Customers
- Internal customer management at `/internal/customers`
- API: `/api/internal/customers`

---

## Environment Variables

```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# WhatsApp
NEXT_PUBLIC_WHATSAPP_NUMBER=   # e.g. 919876543210 (no + or spaces)

# Airtable (optional — only if using Airtable as plant data source)
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
AIRTABLE_PLANTS_TABLE=Plants

# Site URL (for OG metadata)
NEXT_PUBLIC_SITE_URL=
```

---

## Important Gotchas

- **Don't edit homepage content in code** — it lives in Supabase. Use the internal CMS or update the seed in `homepage.seed.json`.
- **Don't touch `supabase/migrations/` directly** unless you know what you're doing — run migrations via Supabase CLI.
- **Pricing is code-owned** — changes to pricing tiers go in `src/config/pricing.ts`, not the CMS.
- **`/legacy/*` routes** exist for old pages (contact, design, maintenance) — these are not linked from the main nav and can be ignored unless specifically needed.
- **`/preview/*` and `/preview-homepage-2026`** are dev/staging preview routes, not production pages.
- **Plant images**: prefer `thumbnail_storage_url` (Supabase Storage) over `thumbnail_url` (external URL) when both are present.

---

## Brand & Design Tokens

See `README_NUVVY.md` for full brand guide. Key Tailwind tokens:

| Token | Hex | Use |
|---|---|---|
| `leaf` | `#22A559` | Primary green — CTAs, accents |
| `fern` | `#0EA5A3` | Secondary aqua |
| `butter` | `#F6F2E9` | Warm cream background |
| `ink` | `#1F2937` | Body text |
| `cane` | `#D4B996` | Wood/rattan accent |
| `mist` | `#EEF6F1` | Subtle section backgrounds |

Container width: 1120px. Corners: `rounded-2xl`. Animations: subtle fade/slide only.

---

## Active CRO & SEO Sprint (Session 1)

This section tracks the marketing/conversion improvements being made to the public homepage. Work started in Cowork — continue here in Claude Code.

### Already done ✅
- `src/app/(public)/page.tsx` — meta title/description updated for Bangalore SEO, og:locale changed to `en_IN`
- `src/components/heroes/SnabbitHero.tsx` — headline rewritten to outcome-focused copy, WhatsApp CTA added, price anchor in subtext

### Pending changes

#### 1. `src/app/(public)/HomepageRenderer.tsx` (largest change)

**Target section order** (current order is wrong — Before/After is buried after Plant Ordering):
1. Hero (SnabbitHero) ← already first
2. SoundFamiliar ← already second
3. **Before/After gallery** ← move up from current position (currently section 5, after Plant Ordering)
4. **Testimonials** ← add new section here (does not exist yet)
5. Meet Nuvvy
6. Garden Care
7. Plant Ordering & Setup
8. Pricing (SimplePricing)
9. Final CTA

**Transformation gallery alt text** — replace generic `alt={\`Transformation ${idx + 1}\`}` with keyword-rich descriptions per image:
```
image-1.png     → "Balcony garden transformation in Whitefield Bangalore - Nuvvy care"
image-2.jpeg    → "Green balcony maintained by Nuvvy horticulturists in Bangalore"
image-3.jpeg    → "Balcony plants thriving after Nuvvy garden care service"
image-4.jpeg    → "Before and after balcony makeover by Nuvvy in Whitefield"
image-6.jpeg    → "Healthy balcony garden in Bangalore society maintained by Nuvvy"
Before_after_7.jpeg → "Lush balcony transformation - Nuvvy plant care Bangalore"
Before_after_8.jpeg → "Indoor and balcony plants cared for by Nuvvy in Whitefield"
```

**Testimonials section to add** (two real customer quotes — use card layout, no star ratings needed):
> "We live in Windmills of Your Mind in Whitefield and have a fairly large green balcony. Since ours is north-facing, we were constantly struggling with pest issues and plants dying... Would definitely recommend Nuvvy to anyone in Whitefield looking for a hassle-free way to maintain a healthy, green balcony."
> — Customer, Windmills of Your Mind, Whitefield

> "So grateful Harshita started Nuvvy and so happy that Nuvvy takes care of my garden. The team's calm energy translates my garden into a tranquil green space."
> — Customer, Windmills of Your Mind

**Final CTA button hierarchy fix** — currently both "Chat on WhatsApp" and "Call us" are identical green rounded-full buttons. Fix:
- "Chat with Nuvvy team on WhatsApp" → keep as primary green (`bg-[#25D366]`)
- "Call us" → change to secondary outline style (`border border-gray-300 text-gray-700 hover:bg-gray-50`, no fill)

#### 2. `src/app/layout.tsx`

Add LocalBusiness + Service JSON-LD schema markup for Bangalore local SEO. Insert as a `<script type="application/ld+json">` tag inside `<head>`. Use this schema:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "name": "Nuvvy",
      "description": "Horticulturist-led balcony and indoor garden care subscription service in Bangalore",
      "url": "https://nuvvy.in",
      "telephone": "+91XXXXXXXXXX",
      "areaServed": ["Whitefield", "Bangalore"],
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Whitefield",
        "addressRegion": "Bangalore",
        "addressCountry": "IN"
      },
      "priceRange": "₹799 - ₹1099/month"
    },
    {
      "@type": "Service",
      "name": "Balcony Garden Care Subscription",
      "provider": { "@type": "LocalBusiness", "name": "Nuvvy" },
      "areaServed": "Bangalore",
      "description": "Monthly subscription for expert horticulturist-led garden care including fertilizer and pest control",
      "offers": {
        "@type": "Offer",
        "price": "799",
        "priceCurrency": "INR",
        "priceSpecification": { "@type": "UnitPriceSpecification", "billingDuration": "P1M" }
      }
    }
  ]
}
```
Use `process.env.NEXT_PUBLIC_WHATSAPP_NUMBER` for the telephone field if available. The telephone in the schema should be formatted as `+91XXXXXXXXXX`.

### Session 2 (future sprint — do not implement yet)
- Add 90-day trial framing near `SimplePricing` section
- FAQ section with FAQPage schema markup
- Dedicated landing pages: `/balcony-garden-setup`, `/garden-care-bangalore`

---

## Nuvvy v2 — Ops Platform (Active Sprint)

A major new ops platform is being built on top of this codebase.

**Full design document:** `../Nuvvy_Tech and Product/nuvvy-ops-hld.md` — read this before making any non-trivial ops changes. It contains the full schema, auth design, scheduling engine, route structure, role-permission matrix, and all resolved decisions.

### Architecture
- **Single Next.js app** — no separate codebase. Route groups:
  - `src/app/(ops)/` — ops platform (admin, horticulturist, gardener)
  - `src/app/(portal)/` — customer portal (P1, not Month 1 — do not build yet)
- **All ops API routes:** `src/app/api/ops/` — protected via `requireOpsAuth()` in `src/lib/auth/ops-auth.ts`
- **Service role** used for all API routes in V1 (RLS not enforced at query level yet — enforced at API layer)
- **Auth utility:** `src/lib/auth/ops-auth.ts` — `requireOpsAuth(request)` returns `{ userId, role, gardener_id }`

### Roles
`admin` | `horticulturist` | `gardener` | `customer` (customer = portal only, P1)
- `admin` — full access to everything
- `horticulturist` — schedule, visits, issues, customer profiles (read-only customer data)
- `gardener` — their assigned visits only; mobile-first UI

### Auth Design (FINALIZED — do not deviate)

**Admin / Horticulturist:** Supabase email magic link (existing pattern). Login at `/ops/login`.

**Gardener:** Token URL + 4-digit PIN. No email, no phone lookup.
- Each gardener has a unique `login_token` (24-char nanoid, stored in `gardeners.login_token`)
- Login page: `/ops/g/[token]` — server component looks up gardener name by token, client form collects PIN
- Auth API: `POST /api/ops/auth/gardener-token` — validates PIN via scrypt, sets Supabase session via `generateLink` + `verifyOtp`
- PIN hashing: **scrypt only** via `src/lib/auth/pin.ts` — never use bcrypt
- `pin_version` integer incremented on PIN reset; included in session to force re-login after reset
- 60-day sessions for gardeners (rarely re-authenticate)
- `/ops/g/[token]` must be in `PUBLIC_OPS_ROUTES` in `src/app/(ops)/layout.tsx`
- Old `/ops/login/gardener` page is retired — redirect to `/ops` if visited

### Database (Migration: `20260407100000_ops_v1_additions.sql` — already run ✅)

Key tables added/extended (see HLD for full schema):
- `societies` — residential societies (customers grouped by society)
- `gardeners` — extended with `login_token`, `pin_version`, `inactive_since`
- `profiles` — extended with `status`, `inactive_since`
- `customers` — extended with `society_id`, `plant_count_range`, `light_condition`, `watering_responsibility`, `plan_start_date`, `billing_cycle_start_day`, `care_notes`
- `service_visits` — extended with `not_completed_reason`, `is_one_off`, `reviewed_by`, `reviewed_at`; status now includes `'not_completed'`
- `visit_checklist_items` — `completion_status` replaces boolean `is_completed` (`pending` | `done` | `not_required`)
- `care_action_types` — seeded with: fertilizer, pesticide, fungicide, soil_amendment
- `customer_care_schedules` — per-customer care action intervals + anchor date
- `service_care_actions` — care actions performed during a visit
- `customer_observations` — horticulturist notes on customer garden
- `customer_photos` — photos associated with customers (stored as relative path in Supabase Storage)
- `service_voice_notes` — voice memos from gardener during visit
- `service_special_tasks` — one-off tasks added to a visit by horticulturist
- `requests` — customer service requests (future use)
- `bills` — billing records per customer per period
- `audit_logs` — who did what, when (ip_address, user_agent captured)
- `system_config` — key-value config (e.g., default checklist template toggle)

**Photo storage:** Relative paths only in DB (e.g., `visit-photos/uuid.jpg`). Use `getSignedUrl(bucket, path)` abstraction — never store full URLs. This allows future migration to S3 without DB changes.

### Care Action Scheduling (FINALIZED — anchored model, not rolling)

`next_due = cycle_anchor_date + (floor((last_done_date - cycle_anchor_date) / freq_days) + 1) * freq_days`

- **Never use rolling model** (last_done + freq) — it allows annual drift
- `cycle_anchor_date` is set when horticulturist configures a care action for a customer
- "Reset Cycle" = horticulturist-only explicit action that sets `cycle_anchor_date = today`
- Conflicts (two care actions on same visit) = warning, not blocker

### Brand Kit — Design Tokens for Ops Platform
**Do NOT use `leaf`/`fern`/`butter`/`cane` tokens on ops pages** — those are marketing site only.

Ops tokens (already in `tailwind.config.ts`):
```
forest:   #2D5A3D   → primary buttons, nav active, visit badges
garden:   #4A7C5F   → hover states, secondary buttons
sage:     #8BAF8A   → secondary text on dark, completed states, subtle icons
terra:    #B5654A   → warnings, overdue, eyebrow labels, issue severity
cream:    #F0E8D8   → page backgrounds, card surfaces (never pure white)
stone:    #D8CCBA   → dividers, input borders, table separators
charcoal: #1E2822   → all body text
offwhite: #FDFAF6   → lightest surface (header backgrounds etc)
```

Fonts (configured in ops layout):
- Headlines / page titles: `Cormorant Garamond` — weight 500, italic 400
- Body / UI / forms: `DM Sans` — weight 300, 400, 500

**UI token mapping:**
| Element | Token |
|---------|-------|
| Primary button | `bg-forest text-offwhite` |
| Secondary button | `border border-stone text-charcoal` |
| Danger / warning | `terra` |
| Page background | `bg-cream` |
| Card / modal surface | `bg-offwhite` |
| Body text | `text-charcoal` |
| Secondary text | `text-sage` or `text-stone` |
| Input border | `border-stone focus:border-forest` |
| Section heading | Cormorant Garamond Medium |
| All other text | DM Sans |

### Mobile UX Standard
All ops pages are mobile-first (gardener views) or responsive (admin/horti). Follow these patterns:
- **Max-width ~480px centered** for gardener views
- **Bottom nav:** sticky, role-aware, always visible
  - Admin/Horti: Home | Schedule | Customers | More
  - Gardener: Today | History
- **`mb-16`** on all slide-up modal containers to clear bottom nav
- **Slide-up modals** for all forms — not page navigations
- **SWR** for client-side data fetching + `mutate()` after every write (gardener views only — do not use in desktop admin pages)
- **Large tap targets** (min 44px) throughout
- Camera capture: `input[type=file][capture=environment]`, compress to <500KB before upload
- Offline: all form state stays in React until Submit (no partial saves) — service worker is Month 2

### Build Sequence & Current Status

**Full phased build plan:** `../Nuvvy_Tech and Product/nuvvy-ops-build-plan.md` — consult this before starting any session. It has task-level detail, file paths, and completion gates for all 4 phases.

**Phase 1 — Foundation (current phase)**

| Item | Status |
|------|--------|
| Database migration (ops_v1_additions) | ✅ Done |
| Gardener token auth API (`/api/ops/auth/gardener-token`) | ✅ Done |
| Gardener login page (`/ops/g/[token]`) | ⬜ Next |
| Update `PUBLIC_OPS_ROUTES` in ops layout | ⬜ Next |
| Retire old `/ops/login/gardener` page | ⬜ Next |
| Update `BottomNav.tsx` per PRD spec | ⬜ Next |
| People Management API + UI (`/ops/people`) | ⬜ Pending |
| Plans Catalog API + UI (`/ops/plans`) | ⬜ Pending |

**Phase 2 — Customer & Schedule Core**
- Customer onboarding wizard (7 steps, draft support)
- Scheduling engine + service generation
- Schedule view (weekly grid / day list)
- Customer 360 view

**Phase 3 — Gardener Visit Execution**
- Gardener today view (SWR, mobile)
- Service execution screen (checklist, care actions, photos, voice)
- Visit completion and not-completed flows

**Phase 4 — Admin Operations & Review**
- Service review + special tasks
- Requests management
- Billing (create, mark paid, reminders)
- Role dashboards

### New Dependencies Approved
- `swr` — gardener mobile views only. Do not use in existing desktop internal pages.

### Desktop-Only Pages
Add `hidden md:block` wrapper + mobile notice for:
- Plant catalog create/edit
- Homepage CMS editor
