"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { Plus, Search, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, UserCheck, UserPlus } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils/format-date";
import LeadCreateModal from "@/components/ops/leads/LeadCreateModal";
import {
  SOURCE_LABELS,
  CLOSED_REASON_LABELS,
  CUSTOMER_TYPE_LABELS,
  relativeTime,
  isOverdue,
  isDueToday,
  needsFollowUp,
  type LeadListItem,
} from "@/components/ops/leads/leadConstants";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

type Tab = "follow-up-today" | "active" | "closed";

const TABS: { value: Tab; label: string }[] = [
  { value: "active", label: "Active leads" },
  { value: "follow-up-today", label: "Follow up today" },
  { value: "closed", label: "Closed" },
];

type CustomerHit = {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  society_name: string | null;
};

const digitsOf = (s: string) => s.replace(/[^\d]/g, "");
// Treat a query as a phone if it's mostly digits (≥6).
const looksLikePhone = (s: string) => digitsOf(s).length >= 6;

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <LeadsPageInner />
    </Suspense>
  );
}

function LeadsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as Tab) || "active";
  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.value === initialTab) ? initialTab : "active"
  );
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createPhone, setCreatePhone] = useState("");
  const [createName, setCreateName] = useState("");

  const searching = searchDebounced.trim().length > 0;

  function openLead(id: string) {
    router.push(`/ops/leads/${id}`);
  }
  function openLeadById(id: string) {
    setShowCreate(false);
    router.push(`/ops/leads/${id}`);
  }
  function startCreate(prefill: string) {
    if (looksLikePhone(prefill)) {
      setCreatePhone(prefill);
      setCreateName("");
    } else {
      setCreatePhone("");
      setCreateName(prefill);
    }
    setShowCreate(true);
  }

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Browse mode (no search): load both states so every tab pill can show a
  // count, regardless of which tab is active. ────────────────────────────────
  const activeKey = searching ? null : "/api/ops/leads?state=active";
  const closedKey = searching ? null : "/api/ops/leads?state=closed";
  const { data: activeData, isLoading: activeLoading, mutate: mutateActive } = useSWR(activeKey, fetcher);
  const { data: closedData, isLoading: closedLoading, mutate: mutateClosed } = useSWR(closedKey, fetcher);
  const activeLeads: LeadListItem[] = useMemo(() => activeData?.leads ?? [], [activeData]);
  const closedLeads: LeadListItem[] = useMemo(() => closedData?.leads ?? [], [closedData]);

  const browseLeads = tab === "closed" ? closedLeads : activeLeads;
  const browseLoading = tab === "closed" ? closedLoading : activeLoading;

  // ── Search mode: look up across both leads AND customers ───────────────────
  const leadSearchKey = searching ? `/api/ops/leads?state=any&q=${encodeURIComponent(searchDebounced)}` : null;
  const custSearchKey = searching ? `/api/ops/customers?q=${encodeURIComponent(searchDebounced)}` : null;
  const { data: leadHitsData, isLoading: leadHitsLoading, mutate: mutateLeadHits } = useSWR(leadSearchKey, fetcher);
  const { data: custHitsData, isLoading: custHitsLoading } = useSWR(custSearchKey, fetcher);
  const leadHits: LeadListItem[] = leadHitsData?.leads ?? [];
  const custHits: CustomerHit[] = custHitsData?.data ?? [];
  const searchLoading = leadHitsLoading || custHitsLoading;

  function refresh() {
    mutateActive();
    mutateClosed();
    mutateLeadHits();
  }

  const followUp = useMemo(() => {
    const due = activeLeads.filter((l) => needsFollowUp(l.next_action_at));
    const overdue = due
      .filter((l) => isOverdue(l.next_action_at))
      .sort((a, b) => (a.next_action_at ?? "").localeCompare(b.next_action_at ?? ""));
    const today = due.filter((l) => isDueToday(l.next_action_at));
    return { overdue, today };
  }, [activeLeads]);

  // Counts for the tab pills (only meaningful once the underlying set loads).
  const tabCounts: Record<Tab, number> = {
    active: activeLeads.length,
    "follow-up-today": followUp.overdue.length + followUp.today.length,
    closed: closedLeads.length,
  };
  const tabCountReady: Record<Tab, boolean> = {
    active: !!activeData,
    "follow-up-today": !!activeData,
    closed: !!closedData,
  };

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1
            className="text-2xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Leads
          </h1>
          <button
            onClick={() => startCreate("")}
            className="flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
          >
            <Plus size={16} /> New lead
          </button>
        </div>

        {/* Universal search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage" />
          <input
            className={`${inputCls} pl-9`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a phone or name — customers & leads…"
          />
        </div>

        {/* Tabs (browse only) */}
        {!searching && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {TABS.map((t) => {
              const selected = tab === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                    selected
                      ? "bg-forest text-offwhite border-forest"
                      : "bg-cream text-charcoal border-stone"
                  }`}
                >
                  {t.label}
                  {tabCountReady[t.value] && (
                    <span
                      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none ${
                        selected ? "bg-offwhite/25 text-offwhite" : "bg-stone/40 text-charcoal"
                      }`}
                    >
                      {tabCounts[t.value]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pt-4 space-y-6">
        {searching ? (
          <SearchResults
            query={searchDebounced}
            loading={searchLoading}
            leadHits={leadHits}
            custHits={custHits}
            onOpenLead={openLead}
            onAddLead={() => startCreate(searchDebounced)}
          />
        ) : browseLoading ? (
          <SkeletonList />
        ) : tab === "follow-up-today" ? (
          followUp.overdue.length === 0 && followUp.today.length === 0 ? (
            <EmptyState text="Nothing to follow up on today. 🌿" />
          ) : (
            <LeadsTable
              leads={[...followUp.overdue, ...followUp.today]}
              onOpen={openLead}
              initialSort={{ key: "follow_up", dir: "asc" }}
            />
          )
        ) : browseLeads.length === 0 ? (
          <EmptyState
            text={
              tab === "active"
                ? "No active leads. Capture your first from WhatsApp."
                : "No closed leads yet."
            }
          />
        ) : (
          <LeadsTable leads={browseLeads} onOpen={openLead} />
        )}
      </div>

      {showCreate && (
        <LeadCreateModal
          initialPhone={createPhone}
          initialName={createName}
          onClose={() => setShowCreate(false)}
          onCreated={refresh}
          onOpenLead={openLeadById}
        />
      )}
    </div>
  );
}

// ── Search results: customers first, then leads, then "add lead" fallback ─────
function SearchResults({
  query,
  loading,
  leadHits,
  custHits,
  onOpenLead,
  onAddLead,
}: {
  query: string;
  loading: boolean;
  leadHits: LeadListItem[];
  custHits: CustomerHit[];
  onOpenLead: (id: string) => void;
  onAddLead: () => void;
}) {
  if (loading) return <SkeletonList />;

  const nothing = custHits.length === 0 && leadHits.length === 0;

  return (
    <div className="space-y-6">
      {custHits.length > 0 && (
        <LeadGroup title="Existing customers" count={custHits.length}>
          {custHits.map((c) => (
            <CustomerRow key={c.id} customer={c} />
          ))}
        </LeadGroup>
      )}

      {leadHits.length > 0 && (
        <LeadGroup title="Existing leads" count={leadHits.length}>
          {leadHits.map((l) => (
            <LeadRow key={l.id} lead={l} onClick={() => onOpenLead(l.id)} />
          ))}
        </LeadGroup>
      )}

      {nothing && (
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-6 text-center">
          <p className="text-sm text-charcoal mb-1">
            No customer or lead found for <span className="font-medium">“{query}”</span>.
          </p>
          <p className="text-xs text-sage mb-4">Capture it as a new lead so it doesn&apos;t slip.</p>
          <button
            onClick={onAddLead}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
          >
            <UserPlus size={15} /> Add as new lead
          </button>
        </div>
      )}
    </div>
  );
}

function CustomerRow({ customer }: { customer: CustomerHit }) {
  return (
    <Link
      href={`/ops/customers/${customer.id}`}
      className="w-full text-left bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 hover:border-forest/40 transition-colors flex items-center justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-medium text-charcoal truncate">{customer.name}</p>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-forest/10 text-forest flex items-center gap-1">
            <UserCheck size={11} /> Customer
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-sage">
          {customer.phone_number && <span>{customer.phone_number}</span>}
          {customer.society_name && <span>{customer.society_name}</span>}
        </div>
      </div>
      <ChevronRight size={18} className="text-stone flex-shrink-0" />
    </Link>
  );
}

/* ========================================================================== */
/*  Sortable table (browse + follow-up views)                                 */
/* ========================================================================== */

type SortKey = "created_at" | "name" | "society" | "source" | "follow_up" | "last_touch" | "status";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

// Date-ish columns default to a sensible direction on first click.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  created_at: "desc",
  last_touch: "desc",
  follow_up: "asc",
  name: "asc",
  society: "asc",
  source: "asc",
  status: "asc",
};

const STATE_RANK: Record<LeadListItem["state"], number> = {
  active: 0,
  converted: 1,
  closed: 2,
};

function strCmpNullsLast(a: string | null, b: string | null, mul: number): number {
  const av = a ?? "";
  const bv = b ?? "";
  if (!av && !bv) return 0;
  if (!av) return 1; // blanks always last, regardless of direction
  if (!bv) return -1;
  return mul * av.localeCompare(bv);
}

function dateCmpNullsLast(a: string | null, b: string | null, mul: number): number {
  if (!a && !b) return 0;
  if (!a) return 1; // no-date rows always last
  if (!b) return -1;
  return mul * (Date.parse(a) - Date.parse(b));
}

function compareLeads(a: LeadListItem, b: LeadListItem, sort: SortState): number {
  const mul = sort.dir === "asc" ? 1 : -1;
  switch (sort.key) {
    case "created_at":
      return mul * (Date.parse(a.created_at) - Date.parse(b.created_at));
    case "name":
      return strCmpNullsLast(a.name ?? a.phone, b.name ?? b.phone, mul);
    case "society":
      return strCmpNullsLast(a.society_name ?? a.area, b.society_name ?? b.area, mul);
    case "source":
      return strCmpNullsLast(
        a.source ? SOURCE_LABELS[a.source] : null,
        b.source ? SOURCE_LABELS[b.source] : null,
        mul
      );
    case "follow_up":
      return dateCmpNullsLast(a.next_action_at, b.next_action_at, mul);
    case "last_touch":
      return dateCmpNullsLast(a.last_touch_at, b.last_touch_at, mul);
    case "status":
      return mul * (STATE_RANK[a.state] - STATE_RANK[b.state]);
  }
}

function followUpClass(date: string | null): string {
  if (!date) return "text-sage";
  if (isOverdue(date)) return "text-terra font-medium";
  if (isDueToday(date)) return "text-garden font-medium";
  return "text-charcoal";
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={`py-2.5 px-3 font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-charcoal transition-colors"
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ChevronUp size={12} className="text-charcoal" />
          ) : (
            <ChevronDown size={12} className="text-charcoal" />
          )
        ) : (
          <ChevronsUpDown size={12} className="opacity-30" />
        )}
      </button>
    </th>
  );
}

function LeadsTable({
  leads,
  onOpen,
  initialSort,
}: {
  leads: LeadListItem[];
  onOpen: (id: string) => void;
  initialSort?: SortState;
}) {
  const [sort, setSort] = useState<SortState>(initialSort ?? { key: "created_at", dir: "desc" });
  const sorted = useMemo(() => [...leads].sort((a, b) => compareLeads(a, b, sort)), [leads, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DEFAULT_DIR[key] }
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block bg-offwhite rounded-2xl border border-stone/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone bg-cream/50 text-left text-sage">
              <SortHeader label="Created" sortKey="created_at" sort={sort} onSort={toggleSort} className="px-4" />
              <SortHeader label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
              <SortHeader label="Society" sortKey="society" sort={sort} onSort={toggleSort} />
              <SortHeader label="Source" sortKey="source" sort={sort} onSort={toggleSort} />
              <SortHeader label="Follow-up" sortKey="follow_up" sort={sort} onSort={toggleSort} />
              <SortHeader label="Last touch" sortKey="last_touch" sort={sort} onSort={toggleSort} />
              <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-stone/30 last:border-0 hover:bg-cream/40 cursor-pointer transition-colors"
                onClick={() => onOpen(lead.id)}
              >
                <td className="py-3 px-4 text-sage whitespace-nowrap">{formatDateTime(lead.created_at)}</td>
                <td className="py-3 px-3">
                  {lead.name ? (
                    <>
                      <span className="font-medium text-charcoal">{lead.name}</span>
                      <span className="block text-xs text-sage">{lead.phone}</span>
                    </>
                  ) : (
                    <span className="font-medium text-sage italic">{lead.phone}</span>
                  )}
                </td>
                <td className="py-3 px-3 text-sage">{lead.society_name ?? lead.area ?? "—"}</td>
                <td className="py-3 px-3 text-charcoal">
                  {lead.source ? SOURCE_LABELS[lead.source] : "—"}
                </td>
                <td className={`py-3 px-3 whitespace-nowrap ${followUpClass(lead.next_action_at)}`}>
                  {lead.next_action_at ? formatDate(lead.next_action_at) : "—"}
                </td>
                <td className="py-3 px-3 text-sage whitespace-nowrap">{relativeTime(lead.last_touch_at)}</td>
                <td className="py-3 px-3">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      lead.state === "closed" ? "bg-stone/20 text-sage" : "bg-forest/10 text-forest"
                    }`}
                  >
                    {lead.state === "closed"
                      ? lead.closed_reason
                        ? CLOSED_REASON_LABELS[lead.closed_reason]
                        : "Closed"
                      : "Active"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {sorted.map((lead) => (
          <LeadRow key={lead.id} lead={lead} onClick={() => onOpen(lead.id)} />
        ))}
      </div>
    </>
  );
}

function LeadRow({ lead, onClick }: { lead: LeadListItem; onClick: () => void }) {
  const overdue = isOverdue(lead.next_action_at);
  const today = isDueToday(lead.next_action_at);
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 hover:border-forest/40 transition-colors flex items-center justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          {lead.name ? (
            <p className="font-medium text-charcoal truncate">{lead.name}</p>
          ) : (
            <p className="font-medium text-sage italic truncate">{lead.phone}</p>
          )}
          {lead.name && <span className="text-xs text-sage truncate">{lead.phone}</span>}
          {lead.state === "closed" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-stone/30 text-sage">
              Closed
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-sage">
          {lead.source && (
            <span className="px-2 py-0.5 rounded-full bg-cream border border-stone/60 text-charcoal">
              {SOURCE_LABELS[lead.source]}
            </span>
          )}
          {lead.intended_customer_type && (
            <span className="px-2 py-0.5 rounded-full bg-forest/10 text-forest">
              → {CUSTOMER_TYPE_LABELS[lead.intended_customer_type]}
            </span>
          )}
          {(lead.society_name || lead.area) && (
            <span>{lead.society_name ?? lead.area}</span>
          )}
          {lead.state === "closed" && lead.closed_reason && (
            <span className="px-2 py-0.5 rounded-full bg-terra/10 text-terra">
              {CLOSED_REASON_LABELS[lead.closed_reason]}
            </span>
          )}
        </div>
        <p className="text-[10px] text-stone mt-1">Created {formatDateTime(lead.created_at)}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[11px] text-sage">{relativeTime(lead.last_touch_at)}</span>
        {lead.next_action_at && (
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
              overdue ? "bg-terra/10 text-terra" : today ? "bg-forest/10 text-garden" : "bg-cream text-sage"
            }`}
          >
            {overdue ? "Overdue" : today ? "Today" : new Date(lead.next_action_at + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
      <ChevronRight size={18} className="text-stone flex-shrink-0" />
    </button>
  );
}

function LeadGroup({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent?: "terra";
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className={`text-xs font-medium uppercase tracking-widest mb-2 ${accent === "terra" ? "text-terra" : "text-sage"}`}>
        {title} <span className="normal-case">({count})</span>
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 animate-pulse">
          <div className="h-4 w-32 bg-stone/30 rounded mb-2" />
          <div className="h-3 w-24 bg-stone/20 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-stone text-center py-12">{text}</p>;
}
