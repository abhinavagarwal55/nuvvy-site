"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Users,
  Calendar,
  AlertCircle,
  CreditCard,
  ClipboardCheck,
  Leaf,
  ChevronRight,
} from "lucide-react";
import { usePerf } from "@/lib/perf/use-perf";

type AdminDashboard = {
  active_customers: number;
  services_today: Record<string, number>;
  services_today_total: number;
  billing: {
    pending_count: number;
    pending_total: number;
    overdue_count: number;
    overdue_total: number;
    follow_up: { id: string; customer_name: string; amount_inr: number; due_date: string; is_overdue: boolean }[];
  };
  open_requests: number;
};

type HortiDashboard = {
  unreviewed_services: number;
  open_requests: number;
  week_services_count: number;
  care_actions_due_this_week: { name: string; count: number }[];
};

const CARE_LABELS: Record<string, string> = {
  fertilizer: "Fertilizer",
  vermi_compost: "Vermi Compost",
  micro_nutrients: "Micro Nutrients",
  neem_oil: "Neem Oil",
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function HomePage() {
  const perfFetcher = usePerf('/api/ops/people/me/role', '/ops/home');

  const { data: roleData, isLoading: roleLoading } = useSWR(
    "/api/ops/people/me/role",
    perfFetcher
  );

  const role = roleData?.data?.role ?? roleData?.role ?? null;

  const { data: adminJson, isLoading: adminLoading } = useSWR(
    role === "admin" ? "/api/ops/dashboard/admin" : null,
    fetcher
  );

  const { data: hortiJson, isLoading: hortiLoading } = useSWR(
    role && role !== "admin" ? "/api/ops/dashboard/horticulturist" : null,
    fetcher
  );

  const adminData: AdminDashboard | null = adminJson?.data ?? null;
  const hortiData: HortiDashboard | null = hortiJson?.data ?? null;

  const loading =
    roleLoading ||
    (role === "admin" && adminLoading) ||
    (role != null && role !== "admin" && hortiLoading);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream pb-24">
        <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4">
          <div className="h-7 w-48 bg-stone/30 rounded-lg animate-pulse" />
          <div className="h-4 w-32 bg-stone/20 rounded mt-2 animate-pulse" />
        </div>
        <div className="px-4 pt-4 space-y-4 max-w-[640px] mx-auto">
          {/* Action required skeleton */}
          <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
            <div className="h-3 w-28 bg-stone/20 rounded animate-pulse mb-3" />
            <div className="grid grid-cols-2 gap-3">
              <SkeletonStatCard />
              <SkeletonStatCard />
            </div>
          </div>
          {/* Services skeleton */}
          <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
            <div className="h-3 w-32 bg-stone/20 rounded animate-pulse mb-3" />
            <div className="grid grid-cols-3 gap-3">
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </div>
          </div>
          {/* Payment skeleton */}
          <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
            <div className="h-3 w-40 bg-stone/20 rounded animate-pulse mb-3" />
            <div className="h-6 w-24 bg-stone/20 rounded animate-pulse mb-3" />
            <div className="space-y-3">
              <div className="h-10 bg-stone/10 rounded animate-pulse" />
              <div className="h-10 bg-stone/10 rounded animate-pulse" />
            </div>
          </div>
          {/* Quick links skeleton */}
          <div className="grid grid-cols-4 gap-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-offwhite rounded-xl border border-stone/60 p-3 text-center"
              >
                <div className="h-5 w-5 bg-stone/20 rounded mx-auto mb-1 animate-pulse" />
                <div className="h-2 w-10 bg-stone/20 rounded mx-auto animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4">
        <h1
          className="text-2xl text-charcoal"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          {role === "admin" ? "Admin Dashboard" : "Dashboard"}
        </h1>
        <p className="text-xs text-sage mt-1">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[640px] mx-auto">
        {role === "admin" && adminData && <AdminView data={adminData} />}
        {role !== "admin" && hortiData && <HortiView data={hortiData} />}
      </div>
    </div>
  );
}

function SkeletonStatCard() {
  return (
    <div className="bg-offwhite rounded-xl border border-stone/60 p-3">
      <div className="h-5 w-5 bg-stone/20 rounded animate-pulse mb-1" />
      <div className="h-5 w-10 bg-stone/20 rounded animate-pulse mb-1" />
      <div className="h-2 w-14 bg-stone/20 rounded animate-pulse" />
    </div>
  );
}

function AdminView({ data }: { data: AdminDashboard }) {
  return (
    <>
      {/* Action required */}
      {(data.billing.overdue_count > 0 || data.open_requests > 0) && (
        <div className="bg-terra/5 rounded-2xl border border-terra/20 p-4">
          <p className="text-xs font-medium text-terra uppercase tracking-widest mb-3">
            Action Required
          </p>
          <div className="grid grid-cols-2 gap-3">
            {data.billing.overdue_count > 0 && (
              <Link href="/ops/billing?status=pending">
                <StatCard
                  icon={<AlertCircle size={18} className="text-terra" />}
                  value={`₹${data.billing.overdue_total.toLocaleString()}`}
                  label={`${data.billing.overdue_count} overdue`}
                  accent="terra"
                />
              </Link>
            )}
            {data.open_requests > 0 && (
              <Link href="/ops/requests">
                <StatCard
                  icon={<ClipboardCheck size={18} className="text-terra" />}
                  value={String(data.open_requests)}
                  label="Open requests"
                  accent="terra"
                />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Today's services */}
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">
          Today&apos;s Services
        </p>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={<Calendar size={18} className="text-forest" />}
            value={String(data.services_today_total)}
            label="Total"
          />
          <StatCard
            icon={<ClipboardCheck size={18} className="text-sage" />}
            value={String(data.services_today["completed"] ?? 0)}
            label="Completed"
          />
          <StatCard
            icon={<Calendar size={18} className="text-charcoal" />}
            value={String(data.services_today["scheduled"] ?? 0)}
            label="Scheduled"
          />
        </div>
      </div>

      {/* Payment follow-up */}
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-sage uppercase tracking-widest">
            Payments to Follow Up
          </p>
          <Link href="/ops/billing" className="text-xs text-forest hover:text-garden">
            View all →
          </Link>
        </div>
        <p className="text-lg font-medium text-charcoal mb-3">
          ₹{data.billing.pending_total.toLocaleString()}{" "}
          <span className="text-xs text-sage font-normal">
            ({data.billing.pending_count} bill{data.billing.pending_count !== 1 ? "s" : ""})
          </span>
        </p>
        {(data.billing.follow_up ?? []).length === 0 ? (
          <p className="text-xs text-stone">No pending bills</p>
        ) : (
          <div className="space-y-2">
            {data.billing.follow_up.map((bill) => (
              <FollowUpRow key={bill.id} bill={bill} />
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <QuickLinks />

      {/* Active customers */}
      <Link href="/ops/customers">
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 flex items-center justify-between hover:border-forest/40">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-forest" />
            <div>
              <p className="text-sm font-medium text-charcoal">
                {data.active_customers} active customers
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-stone" />
        </div>
      </Link>
    </>
  );
}

function HortiView({ data }: { data: HortiDashboard }) {
  return (
    <>
      {/* Unreviewed */}
      {data.unreviewed_services > 0 && (
        <Link href="/ops/services">
          <div className="bg-terra/5 rounded-2xl border border-terra/20 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-terra uppercase tracking-widest mb-1">
                Services to Review
              </p>
              <p className="text-xl font-medium text-charcoal">
                {data.unreviewed_services}
              </p>
              <p className="text-xs text-sage">completed but not yet reviewed</p>
            </div>
            <ChevronRight size={18} className="text-terra" />
          </div>
        </Link>
      )}

      {/* Open requests */}
      {data.open_requests > 0 && (
        <Link href="/ops/requests">
          <StatCard
            icon={<ClipboardCheck size={18} className="text-terra" />}
            value={String(data.open_requests)}
            label="Open requests"
            accent="terra"
          />
        </Link>
      )}

      {/* Care actions this week */}
      {data.care_actions_due_this_week.length > 0 && (
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
          <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">
            Care Actions Due This Week
          </p>
          <div className="space-y-2">
            {data.care_actions_due_this_week.map((ca) => (
              <div
                key={ca.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-charcoal flex items-center gap-2">
                  <Leaf size={14} className="text-sage" />
                  {CARE_LABELS[ca.name] ?? ca.name}
                </span>
                <span className="text-sage font-medium">
                  {ca.count} garden{ca.count !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* This week services */}
      <Link href="/ops/schedule">
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 flex items-center justify-between hover:border-forest/40">
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-forest" />
            <div>
              <p className="text-sm font-medium text-charcoal">
                {data.week_services_count} services this week
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-stone" />
        </div>
      </Link>

      <QuickLinks />
    </>
  );
}

function QuickLinks() {
  const links = [
    { href: "/ops/schedule", label: "Schedule", icon: Calendar },
    { href: "/ops/customers", label: "Customers", icon: Users },
    { href: "/ops/services", label: "Services", icon: ClipboardCheck },
    { href: "/ops/requests", label: "Requests", icon: AlertCircle },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {links.map((link) => (
        <Link key={link.href} href={link.href}>
          <div className="bg-offwhite rounded-xl border border-stone/60 p-3 text-center hover:border-forest/40 transition-colors">
            <link.icon size={20} className="text-forest mx-auto mb-1" />
            <p className="text-[10px] text-charcoal font-medium">{link.label}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function FollowUpRow({
  bill,
}: {
  bill: { id: string; customer_name: string; amount_inr: number; due_date: string; is_overdue: boolean };
}) {
  const [copied, setCopied] = useState(false);

  async function handleRemind() {
    const msg = `Hi ${bill.customer_name}, this is a gentle reminder about your Nuvvy garden care payment of ₹${bill.amount_inr}. Due date: ${bill.due_date}. Please let us know once done! — Team Nuvvy`;
    await navigator.clipboard.writeText(msg);
    await fetch(`/api/ops/billing/${bill.id}/remind`, { method: "POST" });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-stone/20 last:border-0">
      <div>
        <p className="text-sm text-charcoal">{bill.customer_name}</p>
        <p className="text-xs text-sage">
          ₹{bill.amount_inr} · Due {bill.due_date}
          {bill.is_overdue && <span className="text-terra ml-1">(overdue)</span>}
        </p>
      </div>
      <button
        onClick={handleRemind}
        className="text-xs text-forest hover:text-garden font-medium whitespace-nowrap"
      >
        {copied ? "Copied!" : "Send Reminder"}
      </button>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent?: string;
}) {
  return (
    <div className="bg-offwhite rounded-xl border border-stone/60 p-3">
      <div className="flex items-center gap-2 mb-1">{icon}</div>
      <p
        className={`text-lg font-medium ${
          accent === "terra" ? "text-terra" : "text-charcoal"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] text-sage">{label}</p>
    </div>
  );
}
