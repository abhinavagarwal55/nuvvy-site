"use client";

import Link from "next/link";
import { Sprout, ChevronRight } from "lucide-react";

type FollowUpItem = {
  id: string;
  name: string | null;
  phone: string;
  society_name: string | null;
  area: string | null;
  next_action: string | null;
  next_action_at: string | null;
};

export type LeadFollowUpsData = {
  overdue_count: number;
  today_count: number;
  items: FollowUpItem[];
};

const FOLLOW_UP_HREF = "/ops/leads?tab=follow-up-today";

export default function LeadFollowUpCard({ data }: { data: LeadFollowUpsData }) {
  const { overdue_count, today_count, items } = data;
  const today = new Date().toISOString().split("T")[0];
  const hasAny = overdue_count > 0 || today_count > 0;

  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-sage uppercase tracking-widest flex items-center gap-2">
          <Sprout size={14} className="text-forest" />
          Lead follow-ups
        </p>
        {hasAny && (
          <Link href={FOLLOW_UP_HREF} className="text-xs text-forest hover:text-garden font-medium">
            {overdue_count > 0 && <span className="text-terra">{overdue_count} overdue</span>}
            {overdue_count > 0 && today_count > 0 && <span className="text-sage"> · </span>}
            {today_count > 0 && <span>{today_count} today</span>} →
          </Link>
        )}
      </div>

      {!hasAny ? (
        <p className="text-sm text-stone">Nothing to follow up on today. 🌿</p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const overdue = !!it.next_action_at && it.next_action_at < today;
            const isToday = it.next_action_at === today;
            return (
              <Link
                key={it.id}
                href={`/ops/leads/${it.id}`}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-stone/20 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-charcoal truncate">{it.name || it.phone}</p>
                  <p className="text-xs text-sage truncate">
                    {[it.society_name || it.area, it.next_action].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {it.next_action_at && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        overdue ? "bg-terra/10 text-terra" : isToday ? "bg-forest/10 text-garden" : "bg-cream text-sage"
                      }`}
                    >
                      {overdue ? "Overdue" : isToday ? "Today" : new Date(it.next_action_at + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-stone" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
