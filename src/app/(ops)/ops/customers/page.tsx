"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Search, ChevronRight, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { usePerf } from "@/lib/perf/use-perf";
import { NewCustomerBadge } from "@/components/ops/NewCustomerBadge";
import {
  CUSTOMER_TYPE_LABELS,
  type CustomerType,
} from "@/lib/schemas/customer-type";

type Customer = {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  society_name: string | null;
  plant_count_range: string | null;
  customer_type: CustomerType;
  has_care_schedules: boolean | null;
  has_slot: boolean | null;
  has_photos: boolean | null;
  created_at: string;
};

// Type badge (FD-12) — distinct from the status badge.
const TYPE_BADGE: Record<CustomerType, string> = {
  care_plan: "bg-[#EAF2EC] text-forest",
  plant_only: "bg-stone/30 text-charcoal",
};

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "care_plan", label: CUSTOMER_TYPE_LABELS.care_plan },
  { value: "plant_only", label: CUSTOMER_TYPE_LABELS.plant_only },
];

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

function SkeletonCard() {
  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 animate-pulse">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-4 w-32 bg-stone/30 rounded" />
            <div className="h-4 w-14 bg-stone/20 rounded-full" />
          </div>
          <div className="flex gap-3">
            <div className="h-3 w-24 bg-stone/20 rounded" />
            <div className="h-3 w-20 bg-stone/20 rounded" />
          </div>
        </div>
        <div className="h-4 w-4 bg-stone/20 rounded" />
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const perfFetcher = usePerf('/api/ops/customers', '/ops/customers');
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch by status + search only (not type) so we can show a count per type
  // chip and filter by type client-side. Type stays orthogonal to status.
  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (searchDebounced) params.set("q", searchDebounced);
    const qs = params.toString();
    return `/api/ops/customers${qs ? `?${qs}` : ""}`;
  }, [statusFilter, searchDebounced]);

  const { data, isLoading, mutate } = useSWR(swrKey, perfFetcher);
  const allCustomers: Customer[] = data?.data ?? [];

  // Counts per type for the current status/search set (drives the chip badges).
  const typeCounts = useMemo(
    () => ({
      all: allCustomers.length,
      care_plan: allCustomers.filter((c) => c.customer_type === "care_plan").length,
      plant_only: allCustomers.filter((c) => c.customer_type === "plant_only").length,
    }),
    [allCustomers]
  );

  const customers =
    typeFilter === "all"
      ? allCustomers
      : allCustomers.filter((c) => c.customer_type === typeFilter);

  const byName = (a: Customer, b: Customer) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const drafts = customers.filter((c) => c.status === "DRAFT").sort(byName);
  const nonDrafts = customers.filter((c) => c.status !== "DRAFT").sort(byName);

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
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[10px] font-medium text-sage uppercase tracking-widest w-12 flex-shrink-0">
            Status
          </span>
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

        {/* Type segmented filter — orthogonal to status (cohort, not lifecycle) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-2">
          <span className="text-[10px] font-medium text-sage uppercase tracking-widest w-12 flex-shrink-0">
            Type
          </span>
          {TYPE_FILTERS.map((t) => {
            const count = typeCounts[t.value as keyof typeof typeCounts] ?? 0;
            const selected = typeFilter === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                  selected
                    ? "bg-forest text-offwhite border-forest"
                    : "bg-cream text-charcoal border-stone"
                }`}
              >
                {t.label}
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none ${
                    selected ? "bg-offwhite/25 text-offwhite" : "bg-stone/40 text-charcoal"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-6">
        {isLoading ? (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
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
                    <CustomerCard key={c.id} customer={c} onDeleted={() => mutate()} />
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

function CustomerCard({ customer, onDeleted }: { customer: Customer; onDeleted?: () => void }) {
  const router = useRouter();
  const badge = STATUS_BADGE[customer.status] ?? {
    cls: "bg-stone/30 text-charcoal",
    label: customer.status,
  };

  const href =
    customer.status === "DRAFT"
      ? `/ops/customers/new?draft=${customer.id}`
      : `/ops/customers/${customer.id}`;

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete draft "${customer.name}"?`)) return;
    const res = await fetch(`/api/ops/customers/${customer.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to delete");
      return;
    }
    onDeleted?.();
  }

  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 hover:border-forest/40 transition-colors">
      <Link href={href} className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-medium text-charcoal truncate">{customer.name}</p>
            <NewCustomerBadge createdAt={customer.created_at} />
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
              {badge.label}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[customer.customer_type] ?? ""}`}>
              {CUSTOMER_TYPE_LABELS[customer.customer_type] ?? customer.customer_type}
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
            {/* Care-only warnings — meaningless for plant_only (no slot/care). */}
            {customer.customer_type !== "plant_only" && customer.has_slot === false && (
              <span className="text-terra font-medium">Slot needed</span>
            )}
            {customer.customer_type !== "plant_only" && customer.has_care_schedules === false && (
              <span className="text-terra font-medium">Care schedules needed</span>
            )}
            {customer.customer_type !== "plant_only" && customer.has_photos === false && (
              <span className="text-terra font-medium">Photos needed</span>
            )}
          </div>
        </div>
        {customer.status === "DRAFT" && onDeleted && (
          <button
            onClick={handleDelete}
            className="text-stone hover:text-terra p-1 flex-shrink-0"
            title="Delete draft"
          >
            <Trash2 size={16} />
          </button>
        )}
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
