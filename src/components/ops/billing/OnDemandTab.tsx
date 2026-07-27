"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Send, ChevronDown, ChevronUp } from "lucide-react";

type OnDemandBill = {
  id: string;
  service_visit_id: string | null;
  customer: {
    id: string;
    name: string;
    phone_number: string | null;
    source: string | null;
    society: string | null;
    apartment_number: string | null;
  } | null;
  amount: number;
  hourly_rate: number | null;
  actual_hours_spent: number | null;
  status: "draft" | "pending_payment" | "paid";
  generated_at: string | null;
  paid_at: string | null;
  notes: string | null;
  service_date: string | null;
  created_at: string;
};

const STATUS_META: Record<OnDemandBill["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-stone/30 text-charcoal" },
  pending_payment: { label: "Pending", cls: "bg-terra/10 text-terra" },
  paid: { label: "Paid", cls: "bg-[#EAF2EC] text-forest" },
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

function waLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function buildMessage(bill: OnDemandBill): string {
  const name = bill.customer?.name ?? "there";
  const date = bill.service_date ? fmtDate(bill.service_date) : "your recent visit";
  const hrs = bill.actual_hours_spent != null ? `${bill.actual_hours_spent} hr` : "";
  const rate = bill.hourly_rate != null ? ` at ₹${bill.hourly_rate}/hr` : "";
  return (
    `Hi ${name}! 🌿\n\n` +
    `Here's the invoice for your Nuvvy on-demand garden care visit on ${date}.\n` +
    (hrs ? `• Time: ${hrs}${rate}\n` : "") +
    `• Amount due: ₹${bill.amount}\n\n` +
    `You can pay via UPI/bank transfer. Reply here if you have any questions. 🌱\n\n— Team Nuvvy`
  );
}

export default function OnDemandTab({
  month,
  onTotals,
}: {
  month: string; // "YYYY-MM"
  onTotals?: (t: { outstanding: number; paid: number }) => void;
}) {
  const [allBills, setAllBills] = useState<OnDemandBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Scope to the selected month by service date (fall back to created date).
  const bills = allBills.filter(
    (b) => (b.service_date ?? b.created_at ?? "").slice(0, 7) === month
  );

  // Fetch all bills once; the status chips filter client-side so the header
  // totals always reflect the full set (not just the visible rows).
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/ondemand/bills?limit=200`);
    const json = await res.json();
    setAllBills(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    // Optimistic update.
    const prev = allBills;
    setAllBills((bs) => bs.map((b) => (b.id === id ? { ...b, ...optimistic(b, body) } : b)));
    try {
      const res = await fetch(`/api/ops/ondemand/bills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? "Update failed");
        setAllBills(prev);
      } else {
        await load();
      }
    } finally {
      setBusy(null);
    }
  }

  function optimistic(b: OnDemandBill, body: Record<string, unknown>): Partial<OnDemandBill> {
    const patchObj: Partial<OnDemandBill> = {};
    if (body.status) patchObj.status = body.status as OnDemandBill["status"];
    if (body.status === "paid") patchObj.paid_at = new Date().toISOString();
    return patchObj;
  }

  function handlePaidToggle(bill: OnDemandBill, paid: boolean) {
    patch(bill.id, paid ? { status: "paid" } : { status: "pending_payment" });
  }

  function handleSendWa(bill: OnDemandBill) {
    if (!bill.customer?.phone_number) return;
    window.open(waLink(bill.customer.phone_number, buildMessage(bill)), "_blank", "noopener,noreferrer");
    // Moving a draft to pending_payment on first send mirrors "invoice sent".
    if (bill.status === "draft") patch(bill.id, { status: "pending_payment" });
  }

  const outstanding = bills.filter((b) => b.status !== "paid").reduce((s, b) => s + (b.amount ?? 0), 0);
  const paid = bills.filter((b) => b.status === "paid").reduce((s, b) => s + (b.amount ?? 0), 0);

  // Report totals up to the billing header (rendered alongside the tabs, like
  // the care-plan / plant-order totals).
  useEffect(() => {
    onTotals?.({ outstanding, paid });
  }, [onTotals, outstanding, paid]);

  return (
    <div className="px-4 pt-4 space-y-4">
      {loading ? (
        <p className="text-sm text-sage text-center py-10">Loading…</p>
      ) : bills.length === 0 ? (
        <p className="text-sm text-stone text-center py-10">
          No on-demand bills this month. Enter actual hours on a completed on-demand service to generate a bill.
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-offwhite border border-stone/60 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream text-xs text-sage uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Customer</th>
                  <th className="text-left px-3 py-2 font-medium">Source</th>
                  <th className="text-left px-3 py-2 font-medium">Service date</th>
                  <th className="text-right px-3 py-2 font-medium">Hours</th>
                  <th className="text-right px-3 py-2 font-medium">Amount ₹</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Invoice</th>
                  <th className="text-left px-3 py-2 font-medium">WhatsApp</th>
                  <th className="text-left px-3 py-2 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const meta = STATUS_META[b.status];
                  const isOpen = expanded[b.id];
                  const noPhone = !b.customer?.phone_number;
                  return (
                    <Fragment key={b.id}>
                      <tr className="border-t border-stone/40 align-top">
                        <td className="px-3 py-3 text-charcoal font-medium">
                          {b.customer?.name ?? "Unknown"}
                          <p className="text-[11px] text-sage font-normal">
                            {[b.customer?.society, b.customer?.apartment_number].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-charcoal">{b.customer?.source ?? "—"}</td>
                        <td className="px-3 py-3 text-charcoal">{fmtDate(b.service_date)}</td>
                        <td className="px-3 py-3 text-right text-charcoal tabular-nums">
                          {b.actual_hours_spent ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-right text-charcoal tabular-nums">
                          ₹{(b.amount ?? 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.cls}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setExpanded((e) => ({ ...e, [b.id]: !e[b.id] }))}
                            className="inline-flex items-center gap-1 text-xs text-charcoal hover:text-forest"
                          >
                            Preview {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => handleSendWa(b)}
                            disabled={noPhone}
                            title={noPhone ? "No phone on file." : undefined}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border ${
                              noPhone
                                ? "border-stone text-stone cursor-not-allowed"
                                : "bg-forest text-offwhite border-forest hover:bg-garden"
                            }`}
                          >
                            <Send size={12} /> Send WhatsApp
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={b.status === "paid"}
                              disabled={busy === b.id}
                              onChange={(e) => handlePaidToggle(b, e.target.checked)}
                              className="w-4 h-4 accent-forest"
                            />
                            <span className="text-xs text-charcoal">Paid</span>
                          </label>
                          {b.status === "paid" && b.paid_at && (
                            <p className="text-[10px] text-sage mt-1">{fmtDate(b.paid_at)}</p>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-cream/50">
                          <td colSpan={9} className="px-3 py-3">
                            <pre className="whitespace-pre-wrap text-xs text-charcoal bg-cream/60 border border-stone/40 rounded-xl p-3 font-sans">
                              {buildMessage(b)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {bills.map((b) => {
              const meta = STATUS_META[b.status];
              const noPhone = !b.customer?.phone_number;
              return (
                <div key={b.id} className="rounded-2xl border border-stone/60 bg-offwhite p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-charcoal truncate">{b.customer?.name ?? "Unknown"}</p>
                      <p className="text-xs text-sage truncate">
                        {[b.customer?.society, b.customer?.apartment_number].filter(Boolean).join(" · ") || "—"}
                        {b.service_date ? ` · ${fmtDate(b.service_date)}` : ""}
                        {b.customer?.source ? ` · ${b.customer.source}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-charcoal">
                    <span className="text-sage">
                      {b.actual_hours_spent ?? "—"} hr · ₹{b.hourly_rate ?? "—"}/hr
                    </span>
                    <span className="font-medium">₹{(b.amount ?? 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleSendWa(b)}
                      disabled={noPhone}
                      title={noPhone ? "No phone on file." : undefined}
                      className={`flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border ${
                        noPhone
                          ? "border-stone text-stone cursor-not-allowed"
                          : "bg-forest text-offwhite border-forest hover:bg-garden"
                      }`}
                    >
                      <Send size={12} /> Send WhatsApp
                    </button>
                    <label className="inline-flex items-center gap-2 px-2">
                      <input
                        type="checkbox"
                        checked={b.status === "paid"}
                        disabled={busy === b.id}
                        onChange={(e) => handlePaidToggle(b, e.target.checked)}
                        className="w-4 h-4 accent-forest"
                      />
                      <span className="text-xs text-charcoal">Paid</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
