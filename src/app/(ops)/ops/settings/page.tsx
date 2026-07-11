"use client";

import Link from "next/link";
import { Leaf, Building2, ChevronRight, ListChecks } from "lucide-react";

const ENTRIES = [
  {
    href: "/ops/settings/checklist",
    icon: ListChecks,
    title: "Service Checklist",
    description: "Edit checklist items and their Hindi / Kannada translations.",
  },
  {
    href: "/ops/settings/care-actions",
    icon: Leaf,
    title: "Care Actions",
    description: "Default frequency and Hindi / Kannada names for each care action.",
  },
  {
    href: "/ops/settings/societies",
    icon: Building2,
    title: "Societies",
    description: "Manage residential societies, abbreviations, and contact details.",
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-cream pb-24 md:pl-56">
      <div className="bg-offwhite border-b border-stone px-4 md:px-8 pt-6 pb-4 sticky top-0 z-10">
        <h1
          className="text-2xl text-charcoal"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Settings
        </h1>
      </div>

      <div className="px-4 md:px-8 pt-6 max-w-[720px] space-y-3">
        {ENTRIES.map((entry) => {
          const Icon = entry.icon;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              className="flex items-center gap-4 bg-offwhite rounded-2xl border border-stone/60 px-4 py-4 hover:border-forest/40 transition-colors"
            >
              <div className="bg-forest/10 text-forest rounded-xl p-2.5">
                <Icon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-charcoal">{entry.title}</p>
                <p className="text-xs text-sage mt-0.5">{entry.description}</p>
              </div>
              <ChevronRight size={18} className="text-stone flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
