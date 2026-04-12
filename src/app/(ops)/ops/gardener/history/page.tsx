"use client";

import useSWR from "swr";
import { Calendar, CheckCircle, XCircle } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";

type HistoryService = {
  id: string;
  customer_name: string;
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  status: string;
  not_completed_reason: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function GardenerHistoryPage() {
  const { data, isLoading } = useSWR("/api/ops/gardener/history", fetcher);
  const services: HistoryService[] = data?.data ?? [];

  // Group by date
  const byDate: Record<string, HistoryService[]> = {};
  for (const svc of services) {
    if (!byDate[svc.scheduled_date]) byDate[svc.scheduled_date] = [];
    byDate[svc.scheduled_date].push(svc);
  }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4">
        <h1
          className="text-2xl text-charcoal"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          History
        </h1>
        <p className="text-xs text-sage mt-1">
          {services.length} past visit{services.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="px-4 pt-4 max-w-[480px] mx-auto space-y-4">
        {isLoading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : services.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-charcoal font-medium">No past visits yet</p>
            <p className="text-sm text-sage mt-1">
              Completed visits will appear here.
            </p>
          </div>
        ) : (
          dates.map((date) => {
            const dayServices = byDate[date];
            const dateLabel = `${new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}, ${formatDate(date)}`;

            return (
              <div key={date}>
                <p className="text-xs font-medium text-sage uppercase tracking-widest mb-1.5">
                  {dateLabel}
                </p>
                <div className="space-y-1.5">
                  {dayServices.map((svc) => (
                    <div
                      key={svc.id}
                      className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 flex items-center gap-3"
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          svc.status === "completed"
                            ? "bg-[#EAF2EC]"
                            : "bg-terra/10"
                        }`}
                      >
                        {svc.status === "completed" ? (
                          <CheckCircle size={16} className="text-forest" />
                        ) : (
                          <XCircle size={16} className="text-terra" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-charcoal text-sm truncate">
                          {svc.customer_name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-sage">
                          {svc.time_window_start && (
                            <span className="flex items-center gap-1">
                              <Calendar size={10} />
                              {svc.time_window_start}
                            </span>
                          )}
                          <span className="capitalize">
                            {svc.status.replace("_", " ")}
                          </span>
                        </div>
                        {svc.not_completed_reason && (
                          <p className="text-xs text-terra mt-0.5">
                            {svc.not_completed_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
