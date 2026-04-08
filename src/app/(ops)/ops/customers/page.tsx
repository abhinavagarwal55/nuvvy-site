"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Customer = {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  society_name: string | null;
  plant_count_range: string | null;
  has_care_schedules: boolean | null;
  has_slot: boolean | null;
  created_at: string;
};

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  DRAFT: { cls: "bg-stone/30 text-charcoal", label: "Draft" },
  ACTIVE: { cls: "bg-[#EAF2EC] text-forest", label: "Active" },
  INACTIVE: { cls: "bg-stone/30 text-sage", label: "Inactive" },
};

const PLANT_RANGE_LABEL: Record<string, string> = {
  "0_20": "0–20 pots",
  "20_40": "20–40 pots",
  "40_plus": "40+ pots",
};

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (searchDebounced) params.set("q", searchDebounced);
    const qs = params.toString();
    const res = await fetch(`/api/ops/customers${qs ? `?${qs}` : ""}`);
    const json = await res.json();
    setCustomers(json.data ?? []);
    setLoading(false);
  }, [statusFilter, searchDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  const drafts = customers.filter((c) => c.status === "DRAFT");
  const nonDrafts = customers.filter((c) => c.status !== "DRAFT");

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1
            className="text-2xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Customers
          </h1>
          <Link
            href="/ops/customers/new"
            className="flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
          >
            <Plus size={16} />
            New
          </Link>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sage"
          />
          <input
            className={`${inputCls} pl-9`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["all", "ACTIVE", "DRAFT", "INACTIVE"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                statusFilter === s
                  ? "bg-forest text-offwhite border-forest"
                  : "bg-cream text-charcoal border-stone"
              }`}
            >
              {s === "all" ? "All" : STATUS_BADGE[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-6">
        {loading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : customers.length === 0 ? (
          <p className="text-sm text-stone text-center py-10">
            No customers found.
          </p>
        ) : (
          <>
            {/* Drafts section */}
            {drafts.length > 0 &&
              (statusFilter === "all" || statusFilter === "DRAFT") && (
                <Section title="Drafts (in progress)" count={drafts.length}>
                  {drafts.map((c) => (
                    <CustomerCard key={c.id} customer={c} />
                  ))}
                </Section>
              )}

            {/* Main list */}
            {nonDrafts.length > 0 && statusFilter !== "DRAFT" && (
              <Section
                title={statusFilter === "all" ? "Customers" : STATUS_BADGE[statusFilter]?.label ?? statusFilter}
                count={nonDrafts.length}
              >
                {nonDrafts.map((c) => (
                  <CustomerCard key={c.id} customer={c} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CustomerCard({ customer }: { customer: Customer }) {
  const router = useRouter();
  const badge = STATUS_BADGE[customer.status] ?? {
    cls: "bg-stone/30 text-charcoal",
    label: customer.status,
  };

  const href =
    customer.status === "DRAFT"
      ? `/ops/customers/new?draft=${customer.id}`
      : `/ops/customers/${customer.id}`;

  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 hover:border-forest/40 transition-colors">
      <Link href={href} className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-medium text-charcoal truncate">{customer.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-sage">
            {customer.phone_number && <span>{customer.phone_number}</span>}
            {customer.society_name && <span>{customer.society_name}</span>}
            {customer.plant_count_range && (
              <span>
                {PLANT_RANGE_LABEL[customer.plant_count_range] ??
                  customer.plant_count_range}
              </span>
            )}
            {customer.has_slot === false && (
              <span className="text-terra font-medium">Slot needed</span>
            )}
            {customer.has_care_schedules === false && (
              <span className="text-terra font-medium">Care schedules needed</span>
            )}
          </div>
        </div>
        <ChevronRight size={18} className="text-stone flex-shrink-0" />
      </Link>
      {customer.status !== "DRAFT" && (
        <div className="flex items-center gap-3 pt-2 mt-2 border-t border-stone/30">
          <button
            onClick={() => router.push(`/ops/customers/${customer.id}?edit=true`)}
            className="flex items-center gap-1.5 text-xs text-forest hover:text-garden font-medium"
          >
            <Pencil size={12} /> Edit
          </button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-sage uppercase tracking-widest mb-2">
        {title} <span className="normal-case">({count})</span>
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
