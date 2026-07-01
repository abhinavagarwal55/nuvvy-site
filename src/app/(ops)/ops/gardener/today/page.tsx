"use client";

import useSWR from "swr";
import Link from "next/link";
import { Clock, ChevronRight, Play, MapPin } from "lucide-react";
import { usePerf } from "@/lib/perf/use-perf";

type WeekService = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_address: string | null;
  customer_society: string | null;
  customer_unit: string | null;
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
};

// Prefer the structured "society · unit" location; fall back to free-text address.
function buildLocationLine(
  society: string | null,
  unit: string | null,
  address: string | null
): string | null {
  const structured = [society, unit].filter(Boolean).join(" · ");
  return structured || address || null;
}

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  scheduled: { cls: "bg-cream text-charcoal border-stone", label: "Scheduled" },
  in_progress: { cls: "bg-forest/10 text-forest border-forest/30", label: "In Progress" },
  completed: { cls: "bg-[#EAF2EC] text-sage border-sage/30", label: "Completed" },
  not_completed: { cls: "bg-terra/10 text-terra border-terra/30", label: "Not Completed" },
  cancelled: { cls: "bg-stone/20 text-sage border-stone/40", label: "Cancelled" },
};

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDayLabel(dateStr: string, today: string): string {
  if (dateStr === today) return "Today";
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(today + "T00:00:00");
  const diffDays = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diffDays === 1) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}

export default function GardenerTodayPage() {
  const perfFetcher = usePerf('/api/ops/gardener/today', '/ops/gardener/today');

  const { data, error, isLoading } = useSWR(
    "/api/ops/gardener/today",
    perfFetcher,
    { refreshInterval: 30000 } // poll every 30s
  );

  const services: WeekService[] = data?.data ?? [];
  const today = todayStr();

  // Group services by date
  const byDate: Record<string, WeekService[]> = {};
  for (const svc of services) {
    if (!byDate[svc.scheduled_date]) byDate[svc.scheduled_date] = [];
    byDate[svc.scheduled_date].push(svc);
  }
  const dates = Object.keys(byDate).sort();

  // Today's stats
  const todayServices = byDate[today] ?? [];
  const todayDone = todayServices.filter(
    (s) => s.status === "completed" || s.status === "not_completed"
  ).length;

  const todayLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4">
        <p className="text-xs text-sage uppercase tracking-widest mb-1">
          This Week
        </p>
        <h1
          className="text-2xl text-charcoal"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          {todayLabel}
        </h1>
        <p className="text-sm text-sage mt-1">
          {todayServices.length} visit{todayServices.length !== 1 ? "s" : ""} today
          {todayDone > 0 && ` · ${todayDone} done`}
        </p>
      </div>

      <div className="px-4 pt-4 space-y-5">
        {isLoading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : error ? (
          <p className="text-sm text-terra text-center py-10">
            Failed to load. Pull to refresh.
          </p>
        ) : services.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-charcoal font-medium">No upcoming visits</p>
            <p className="text-sm text-sage mt-1">Nothing scheduled for the next 7 days.</p>
          </div>
        ) : (
          dates.map((date) => (
            <Section key={date} title={formatDayLabel(date, today)} count={byDate[date].length}>
              {byDate[date].map((s) => (
                <ServiceCard key={s.id} service={s} />
              ))}
            </Section>
          ))
        )}
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: WeekService }) {
  const badge = STATUS_BADGE[service.status] ?? {
    cls: "bg-stone/20 text-charcoal border-stone",
    label: service.status,
  };

  return (
    <Link href={`/ops/gardener/services/${service.id}`}>
      <div className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3.5 flex items-center gap-3 active:bg-cream transition-colors min-h-[68px]">
        {/* Status indicator */}
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${badge.cls}`}
        >
          {service.status === "scheduled" && <Play size={18} />}
          {service.status === "in_progress" && (
            <Clock size={18} className="animate-pulse" />
          )}
          {service.status === "completed" && (
            <span className="text-base">✓</span>
          )}
          {service.status === "not_completed" && (
            <span className="text-base">✕</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-charcoal truncate">
            {service.customer_name}
          </p>
          {(() => {
            const line = buildLocationLine(service.customer_society, service.customer_unit, service.customer_address);
            return line ? (
              <p className="flex items-start gap-1 text-xs text-sage mt-0.5 truncate">
                <MapPin size={11} className="mt-0.5 flex-shrink-0" />
                <span className="truncate">{line}</span>
              </p>
            ) : null;
          })()}
          <div className="flex items-center gap-2 text-xs text-sage mt-0.5">
            {service.time_window_start && (
              <span>
                {service.time_window_start} – {service.time_window_end}
              </span>
            )}
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
        </div>

        <ChevronRight size={18} className="text-stone flex-shrink-0" />
      </div>
    </Link>
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
        {title} ({count})
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
