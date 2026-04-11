"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  Users,
  MoreHorizontal,
  Clock,
  History,
  ClipboardList,
  AlertCircle,
  CreditCard,
  UserCog,
  LayoutGrid,
  Leaf,
  List,
  LogOut,
  User,
  ChevronRight,
  BarChart2,
} from "lucide-react";
import { useState } from "react";
import type { OpsRole } from "@/lib/internal/authz";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

// ─── Gardener (always bottom nav) ──────────────────────────────────────────

const gardenerNav: NavItem[] = [
  { href: "/ops/gardener/today", label: "Today", icon: <Clock size={20} /> },
  { href: "/ops/gardener/history", label: "History", icon: <History size={20} /> },
];

// ─── Admin / Horti ─────────────────────────────────────────────────────────

const primaryNav: NavItem[] = [
  { href: "/ops/home", label: "Home", icon: <Home size={20} /> },
  { href: "/ops/schedule", label: "Schedule", icon: <Calendar size={20} /> },
  { href: "/ops/customers", label: "Customers", icon: <Users size={20} /> },
  { href: "/ops/services", label: "Services", icon: <ClipboardList size={20} /> },
  { href: "/ops/requests", label: "Requests", icon: <AlertCircle size={20} /> },
  { href: "/ops/billing", label: "Billing", icon: <CreditCard size={20} /> },
  { href: "/ops/people", label: "People", icon: <UserCog size={20} /> },
  { href: "/ops/plans", label: "Plans", icon: <LayoutGrid size={20} /> },
];

const secondaryNav: NavItem[] = [
  { href: "/internal/plants", label: "Plant Catalog", icon: <Leaf size={20} /> },
  { href: "/internal/shortlists", label: "Shortlists", icon: <List size={20} /> },
  { href: "/internal/homepage", label: "CMS", icon: <LayoutGrid size={20} /> },
];

const mobileBottomNav: NavItem[] = [
  { href: "/ops/home", label: "Home", icon: <Home size={20} /> },
  { href: "/ops/schedule", label: "Schedule", icon: <Calendar size={20} /> },
  { href: "/ops/customers", label: "Customers", icon: <Users size={20} /> },
  { href: "/ops/more", label: "More", icon: <MoreHorizontal size={20} /> },
];

// ─── Component ─────────────────────────────────────────────────────────────

export default function BottomNav({ role }: { role: OpsRole }) {
  if (role === "gardener") {
    return <MobileNav items={gardenerNav} />;
  }

  return (
    <>
      {/* Desktop: left sidebar — hidden on mobile */}
      <DesktopSidebar role={role} />
      {/* Mobile: bottom nav — hidden on desktop */}
      <MobileNav items={mobileBottomNav} className="md:hidden" role={role} />
    </>
  );
}

// ─── Desktop Sidebar ───────────────────────────────────────────────────────

function DesktopSidebar({ role }: { role: OpsRole }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col fixed top-0 left-0 h-full w-56 bg-offwhite border-r border-stone z-40">
      {/* Brand */}
      <div className="px-5 pt-6 pb-4 border-b border-stone/50">
        <p
          className="text-lg text-charcoal"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Nuvvy Ops
        </p>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 px-3 pt-4 space-y-0.5 overflow-y-auto">
        {primaryNav.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                isActive
                  ? "bg-forest text-offwhite"
                  : "text-charcoal hover:bg-cream"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}

        {/* Divider */}
        <div className="border-t border-stone/40 my-3" />

        {secondaryNav.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-colors ${
                isActive
                  ? "bg-forest text-offwhite"
                  : "text-sage hover:bg-cream hover:text-charcoal"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}

        {/* Admin-only: Metrics */}
        {role === "admin" && (
          <>
            <div className="border-t border-stone/40 my-3" />
            <Link
              href="/ops/metrics"
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-colors ${
                pathname === "/ops/metrics"
                  ? "bg-forest text-offwhite"
                  : "text-sage hover:bg-cream hover:text-charcoal"
              }`}
            >
              <BarChart2 size={16} />
              Metrics
            </Link>
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4 border-t border-stone/40 pt-3">
        <button
          onClick={async () => {
            await fetch("/api/ops/auth/logout", { method: "POST" });
            window.location.href = "/ops/login";
          }}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-sage hover:bg-cream hover:text-charcoal transition-colors w-full"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}

// ─── Mobile Bottom Nav ─────────────────────────────────────────────────────

function MobileNav({
  items,
  className = "",
  role,
}: {
  items: NavItem[];
  className?: string;
  role?: OpsRole;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setMoreOpen(false)}
        />
      )}
      {moreOpen && (
        <div className="fixed left-0 right-0 bg-offwhite border-t border-stone rounded-t-2xl z-50 px-4 py-4 space-y-1 max-h-[70vh] overflow-y-auto" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}>
          {[...primaryNav.slice(3), ...secondaryNav].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-charcoal hover:bg-cream"
            >
              <span className="flex items-center gap-3">
                {item.icon}
                {item.label}
              </span>
              <ChevronRight size={16} className="text-stone" />
            </Link>
          ))}

          {/* Admin-only: Metrics */}
          {role === "admin" && (
            <Link
              href="/ops/metrics"
              onClick={() => setMoreOpen(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-charcoal hover:bg-cream"
            >
              <span className="flex items-center gap-3">
                <BarChart2 size={20} />
                Metrics
              </span>
              <ChevronRight size={16} className="text-stone" />
            </Link>
          )}

          {/* Divider + Profile & Logout */}
          <div className="border-t border-stone/40 my-2" />
          <Link
            href="/ops/profile"
            onClick={() => setMoreOpen(false)}
            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-charcoal hover:bg-cream"
          >
            <span className="flex items-center gap-3">
              <User size={20} />
              Profile
            </span>
            <ChevronRight size={16} className="text-stone" />
          </Link>
          <button
            onClick={async () => {
              setMoreOpen(false);
              await fetch("/api/ops/auth/logout", { method: "POST" });
              window.location.href = "/ops/login";
            }}
            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-sage hover:bg-cream w-full"
          >
            <span className="flex items-center gap-3">
              <LogOut size={20} />
              Logout
            </span>
          </button>
        </div>
      )}

      <nav
        className={`fixed bottom-0 left-0 right-0 bg-offwhite border-t border-stone flex items-center justify-around z-40 ${className}`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {items.map((item) => {
          const isMore = item.href === "/ops/more";
          const isActive = isMore
            ? moreOpen
            : pathname === item.href || pathname.startsWith(item.href + "/");

          return isMore ? (
            <button
              key="more"
              onClick={() => setMoreOpen((o) => !o)}
              className={`flex flex-col items-center gap-0.5 min-w-[44px] min-h-[44px] justify-center px-3 transition-colors ${
                isActive ? "text-forest" : "text-charcoal/50"
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 min-w-[44px] min-h-[44px] justify-center px-3 transition-colors ${
                isActive ? "text-forest" : "text-charcoal/50"
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
