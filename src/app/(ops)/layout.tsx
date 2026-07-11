import { cookies, headers } from "next/headers";
import { Cormorant_Garamond, DM_Sans, Noto_Sans_Devanagari, Noto_Sans_Kannada } from "next/font/google";
import { requireOpsAccess } from "@/lib/internal/authz";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import BottomNav from "./BottomNav";
import type { OpsRole } from "@/lib/internal/authz";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { readLocaleFromStore } from "@/lib/i18n/cookie";

export const dynamic = "force-dynamic";

const cormorant = Cormorant_Garamond({
  weight: ["400", "500"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-cormorant",
});

const dmSans = DM_Sans({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

// Indic scripts for the gardener language switcher (hi / kn). DM Sans /
// Cormorant carry no Devanagari or Kannada glyphs — without these the gardener
// screens render tofu boxes. PRD §2.4.
const notoDeva = Noto_Sans_Devanagari({
  weight: ["300", "400", "500"],
  subsets: ["devanagari"],
  variable: "--font-noto-deva",
});

const notoKannada = Noto_Sans_Kannada({
  weight: ["300", "400", "500"],
  subsets: ["kannada"],
  variable: "--font-noto-kannada",
});

// Routes that don't require authentication
const PUBLIC_OPS_ROUTES = ["/ops/login", "/ops/not-registered", "/ops/g/"];

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Try to determine the current path from headers or referer
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";

  const isPublicRoute = PUBLIC_OPS_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route)
  );

  let role: OpsRole | null = null;
  let canAccessBilling = false;

  if (!isPublicRoute) {
    // Protected route — redirect to login if not authenticated
    const auth = await requireOpsAccess(["admin", "horticulturist", "gardener"]);
    role = auth.role;
    // Billing nav visibility: admins always; horticulturists only when granted.
    if (role === "admin") {
      canAccessBilling = true;
    } else if (role === "horticulturist") {
      const adminSupabase = createAdminSupabaseClient();
      const { data } = await adminSupabase
        .from("profiles")
        .select("can_access_billing")
        .eq("id", auth.userId)
        .single();
      canAccessBilling = data?.can_access_billing === true;
    }
  }
  // Public routes (login, gardener PIN page) never show sidebar

  // Resolve the gardener's active locale server-side from the nuvvy_lang cookie
  // (set from gardeners.preferred_language on login) so the first paint is in
  // the right language with no flash of English. Admin/horti stay 'en'.
  const cookieStore = await cookies();
  const initialLocale = readLocaleFromStore(cookieStore);

  return (
    <div
      className={`${cormorant.variable} ${dmSans.variable} ${notoDeva.variable} ${notoKannada.variable} bg-cream min-h-screen`}
      style={{ fontFamily: "var(--font-dm-sans, sans-serif)" }}
    >
      <LocaleProvider initialLocale={initialLocale}>
        {role && <BottomNav role={role} canAccessBilling={canAccessBilling} />}
        <div
          className={`relative min-h-screen ${
            role === "gardener"
              ? "max-w-[480px] mx-auto"
              : "md:ml-56"
          }`}
          style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
        >
          {children}
        </div>
      </LocaleProvider>
    </div>
  );
}
