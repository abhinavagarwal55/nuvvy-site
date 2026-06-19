"use client";

import { useState, useEffect, useCallback } from "react";

type Pair = { billed: number; collected: number };
type CostPair = { recorded: number; paid: number };

type SummaryData = {
  month: string;
  month_label: string;
  revenue: {
    care_plans: Pair;
    plant_orders: Pair;
    total: Pair;
  };
  costs: {
    inputs: CostPair;
    plant_procurement: CostPair;
    salary: CostPair;
    consultant: CostPair;
    overhead: CostPair;
    total: CostPair;
  };
  profit: { accrual: number; cash: number };
};

function inr(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN")}`;
}

export default function SummaryTab({ month }: { month: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/summary?month=${month}`);
      if (!res.ok) {
        setData(null);
        return;
      }
      const json = await res.json();
      setData(json.data ?? null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-sage text-center py-10">Loading…</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-stone text-center py-10">
        Could not load summary.
      </p>
    );
  }

  const { revenue, costs, profit } = data;

  return (
    <div className="px-4 pt-4 space-y-4 max-w-[640px]">
      {/* Revenue */}
      <div className="bg-offwhite border border-stone/60 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream text-xs text-sage uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Revenue</th>
              <th className="text-right px-4 py-2 font-medium">Billed</th>
              <th className="text-right px-4 py-2 font-medium">Collected</th>
            </tr>
          </thead>
          <tbody>
            <SummaryLine label="Care plans" a={revenue.care_plans.billed} b={revenue.care_plans.collected} />
            <SummaryLine label="Plant orders" a={revenue.plant_orders.billed} b={revenue.plant_orders.collected} />
            <SummaryLine label="Total revenue" a={revenue.total.billed} b={revenue.total.collected} strong />
          </tbody>
        </table>
      </div>

      {/* Costs */}
      <div className="bg-offwhite border border-stone/60 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream text-xs text-sage uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Costs</th>
              <th className="text-right px-4 py-2 font-medium">Recorded</th>
              <th className="text-right px-4 py-2 font-medium">Paid</th>
            </tr>
          </thead>
          <tbody>
            <SummaryLine label="Garden inputs" a={costs.inputs.recorded} b={costs.inputs.paid} />
            <SummaryLine label="Plant procurement" a={costs.plant_procurement.recorded} b={costs.plant_procurement.paid} />
            <SummaryLine label="Salaries" a={costs.salary.recorded} b={costs.salary.paid} />
            <SummaryLine label="Consultant" a={costs.consultant.recorded} b={costs.consultant.paid} />
            <SummaryLine label="Overheads" a={costs.overhead.recorded} b={costs.overhead.paid} />
            <SummaryLine label="Total costs" a={costs.total.recorded} b={costs.total.paid} strong />
          </tbody>
        </table>
      </div>

      {/* Profit */}
      <div className="bg-offwhite border border-stone/60 rounded-2xl px-4 py-3">
        <ProfitLine
          label="Profit (billed revenue − total costs)"
          value={profit.accrual}
        />
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  a,
  b,
  strong,
}: {
  label: string;
  a: number;
  b: number;
  strong?: boolean;
}) {
  return (
    <tr className={`border-t border-stone/40 ${strong ? "font-medium" : ""}`}>
      <td className={`px-4 py-2.5 ${strong ? "text-charcoal" : "text-charcoal"}`}>
        {label}
      </td>
      <td className="px-4 py-2.5 text-right text-charcoal tabular-nums">{inr(a)}</td>
      <td className="px-4 py-2.5 text-right text-charcoal tabular-nums">{inr(b)}</td>
    </tr>
  );
}

function ProfitLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-charcoal">{label}</span>
      <span
        className={`text-base font-medium tabular-nums ${
          value < 0 ? "text-terra" : "text-forest"
        }`}
      >
        {inr(value)}
      </span>
    </div>
  );
}
