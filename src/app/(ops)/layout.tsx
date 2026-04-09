import { headers } from "next/headers";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { requireOpsAccess } from "@/lib/internal/authz";
import BottomNav from "./BottomNav";
import type { OpsRole } from "@/lib/internal/authz";

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

// Routes that don't require authentication
const PUBLIC_OPS_ROUTES = ["/ops/login", "/ops/not-registered", "/ops/g/"];

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";

  const isPublicRoute = PUBLIC_OPS_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  let role: OpsRole | null = null;

  // If pathname header is missing, assume this is an ops route that needs auth
  // (this layout only renders for /ops/* routes)
  const needsAuth = !isPublicRoute;

  if (needsAuth) {
    const auth = await requireOpsAccess(["admin", "horticulturist", "gardener"]);
    role = auth.role;
  }

  return (
    <div
      className={`${cormorant.variable} ${dmSans.variable} bg-cream min-h-screen`}
      style={{ fontFamily: "var(--font-dm-sans, sans-serif)" }}
    >
      {role && <BottomNav role={role} />}
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
    </div>
  );
}
