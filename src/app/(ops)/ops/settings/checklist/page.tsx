"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ChecklistEditor from "./ChecklistEditor";
import GuidelinesEditor from "./GuidelinesEditor";
import CareTranslationsEditor from "./CareTranslationsEditor";

type Tab = "checklist" | "guidelines" | "care";

export default function ChecklistSettingsPage() {
  const [tab, setTab] = useState<Tab>("checklist");
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ops/whoami")
      .then((r) => r.json())
      .then((j) => setRole(j.data?.role ?? null))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-cream pb-24 md:pl-56">
      <div className="bg-offwhite border-b border-stone px-4 md:px-8 pt-6 pb-0 sticky top-0 z-10">
        <Link href="/ops/settings" className="inline-flex items-center gap-1 text-sm text-sage mb-2">
          <ArrowLeft size={14} /> Settings
        </Link>
        <h1
          className="text-2xl text-charcoal"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Service Checklist
        </h1>
        {/* Tabs */}
        <div className="flex gap-1 mt-3 -mb-px">
          {(
            [
              { key: "checklist", label: "Checklist Items" },
              { key: "guidelines", label: "Do's & Don'ts" },
              { key: "care", label: "Care Action Names" },
            ] as { key: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm rounded-t-xl border-b-2 transition-colors ${
                tab === t.key
                  ? "border-forest text-forest font-medium"
                  : "border-transparent text-sage hover:text-charcoal"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6 max-w-[900px]">
        {tab === "checklist" && <ChecklistEditor role={role} />}
        {tab === "guidelines" && <GuidelinesEditor role={role} />}
        {tab === "care" && <CareTranslationsEditor role={role} />}
      </div>
    </div>
  );
}
