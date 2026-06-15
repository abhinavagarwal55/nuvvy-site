"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Pencil,
  Send,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import {
  BILLING_TEMPLATE_TOKEN_HELP,
  DEFAULT_BILLING_TEMPLATE,
  DEFAULT_NUVVY_UPI_ID,
  currentMonthKey,
  formatMonthLabel,
  formatPlanFrequency,
  renderBillingTemplate,
} from "@/lib/billing/template";
import { NewCustomerBadge } from "@/components/ops/NewCustomerBadge";
import PlantOrderBillingList, {
  type PlantOrderBillingRow,
} from "@/components/ops/billing/PlantOrderBillingList";
import PlantInvoiceTemplateModal from "@/components/ops/billing/PlantInvoiceTemplateModal";
import {
  DEFAULT_PLANT_INVOICE_TEMPLATE,
  DEFAULT_PLANT_INVOICE_SERVICE_LINES,
  DEFAULT_PLANT_INVOICE_FOOTER_NOTE,
} from "@/lib/billing/plant-invoice-template";

type BillingTab = "care_plans" | "plant_orders";

type PlantOrderTotals = { revenue: number; paid: number; outstanding: number };

type Row = {
  subscription_id: string;
  customer_id: string;
  customer_name: string;
  customer_created_at: string | null;
  phone_number: string | null;
  plan_name: string;
  plan_price: number;
  visit_frequency: "weekly" | "fortnightly" | "monthly";
  default_amount_inr: number;
  bill_id: string | null;
  amount_inr: number;
  is_paid: boolean;
  paid_at: string | null;
  last_reminder_sent_at: string | null;
};

type Totals = { billed: number; paid: number; due: number };

type ApiResponse = {
  data: {
    month: string;
    month_label: string;
    rows: Row[];
    totals: Totals;
  };
};

const inputCls =
  "w-full px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function computeTotals(rows: Row[]): Totals {
  const billed = rows.reduce((s, r) => s + r.amount_inr, 0);
  const paid = rows.reduce((s, r) => s + (r.is_paid ? r.amount_inr : 0), 0);
  return { billed, paid, due: billed - paid };
}

function buildDraft(template: string, row: Row, month: string): string {
  return renderBillingTemplate(template, {
    customer_name: row.customer_name,
    plan_frequency: formatPlanFrequency(row.visit_frequency),
    amount: row.amount_inr,
    month_year: formatMonthLabel(month),
    upi_id: DEFAULT_NUVVY_UPI_ID,
  });
}

function waLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export default function BillingPage() {
  const [tab, setTab] = useState<BillingTab>("care_plans");
  const [month, setMonth] = useState<string>(() => currentMonthKey());
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>({ billed: 0, paid: 0, due: 0 });
  const [monthLabel, setMonthLabel] = useState<string>(formatMonthLabel(currentMonthKey()));
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"admin" | "horticulturist" | "gardener" | null>(null);
  const [template, setTemplate] = useState<string>(DEFAULT_BILLING_TEMPLATE);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showPoTemplate, setShowPoTemplate] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [expandedDraft, setExpandedDraft] = useState<Record<string, boolean>>({});

  // Plant Orders tab state
  const [poRows, setPoRows] = useState<PlantOrderBillingRow[]>([]);
  const [poTotals, setPoTotals] = useState<PlantOrderTotals>({ revenue: 0, paid: 0, outstanding: 0 });
  const [poLoading, setPoLoading] = useState(true);
  const [poTemplate, setPoTemplate] = useState<string>(DEFAULT_PLANT_INVOICE_TEMPLATE);
  const [poServiceLines, setPoServiceLines] = useState<string[]>(DEFAULT_PLANT_INVOICE_SERVICE_LINES);
  const [poFooterNote, setPoFooterNote] = useState<string>(DEFAULT_PLANT_INVOICE_FOOTER_NOTE);

  const isAdmin = role === "admin";
  const canView = role === "admin" || role === "horticulturist";

  useEffect(() => {
    fetch("/api/ops/people/me/role")
      .then((r) => r.json())
      .then((d) => setRole(d.data?.role ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/ops/system-config/billing-template")
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.template) setTemplate(d.data.template);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/ops/system-config/plant-invoice-template")
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.template) setPoTemplate(d.data.template);
        if (Array.isArray(d.data?.service_lines)) setPoServiceLines(d.data.service_lines);
        if (typeof d.data?.footer_note === "string") setPoFooterNote(d.data.footer_note);
      })
      .catch(() => {});
  }, []);

  const loadPlantOrders = useCallback(async () => {
    setPoLoading(true);
    try {
      const res = await fetch(`/api/ops/billing/plant-orders?month=${month}`);
      if (!res.ok) {
        setPoRows([]);
        setPoTotals({ revenue: 0, paid: 0, outstanding: 0 });
        return;
      }
      const json = await res.json();
      setPoRows(json.data?.rows ?? []);
      setPoTotals(json.data?.totals ?? { revenue: 0, paid: 0, outstanding: 0 });
    } finally {
      setPoLoading(false);
    }
  }, [month]);

  // Load plant-order totals regardless of active tab so the combined
  // (all-billing) strip stays accurate. Reruns on month change.
  useEffect(() => {
    loadPlantOrders();
  }, [loadPlantOrders]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/billing/subscriptions?month=${month}`);
      if (!res.ok) {
        setRows([]);
        setTotals({ billed: 0, paid: 0, due: 0 });
        setMonthLabel(formatMonthLabel(month));
        return;
      }
      const json: ApiResponse = await res.json();
      setRows(json.data.rows);
      setTotals(json.data.totals);
      setMonthLabel(json.data.month_label);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  function setRowErr(id: string, msg: string | null) {
    setRowError((prev) => {
      const next = { ...prev };
      if (msg) next[id] = msg;
      else delete next[id];
      return next;
    });
    if (msg) {
      window.setTimeout(() => {
        setRowError((prev) => {
          if (prev[id] !== msg) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 4000);
    }
  }

  async function mutateRow(
    row: Row,
    body: { amount_inr?: number; paid?: boolean; mark_reminder_sent?: boolean },
    optimistic: Partial<Row>
  ) {
    const prev = rows;
    const optimisticRows = rows.map((r) =>
      r.subscription_id === row.subscription_id ? { ...r, ...optimistic } : r
    );
    setRows(optimisticRows);
    setTotals(computeTotals(optimisticRows));

    try {
      const res = await fetch(
        `/api/ops/billing/subscriptions/${row.subscription_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, ...body }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setRows(prev);
        setTotals(computeTotals(prev));
        setRowErr(row.subscription_id, json.error ?? "Update failed");
        return;
      }
      const updated = json.data as Row;
      setRows((cur) => {
        const next = cur.map((r) =>
          r.subscription_id === updated.subscription_id ? updated : r
        );
        setTotals(computeTotals(next));
        return next;
      });
      setRowErr(row.subscription_id, null);
    } catch {
      setRows(prev);
      setTotals(computeTotals(prev));
      setRowErr(row.subscription_id, "Network error");
    }
  }

  function handleAmountSave(row: Row, raw: string) {
    const parsed = Math.max(0, Math.round(Number(raw)));
    if (Number.isNaN(parsed) || parsed === row.amount_inr) return;
    mutateRow(row, { amount_inr: parsed }, { amount_inr: parsed });
  }

  function handlePaidToggle(row: Row, paid: boolean) {
    mutateRow(
      row,
      { paid },
      {
        is_paid: paid,
        paid_at: paid ? new Date().toISOString() : null,
      }
    );
  }

  function handleSendWa(row: Row) {
    if (!row.phone_number) return;
    const draft = buildDraft(template, row, month);
    window.open(waLink(row.phone_number, draft), "_blank", "noopener,noreferrer");
    mutateRow(
      row,
      { mark_reminder_sent: true },
      { last_reminder_sent_at: new Date().toISOString() }
    );
  }

  if (role !== null && role !== "admin") {
    return (
      <div className="min-h-screen bg-cream px-4 py-10">
        <p className="text-sm text-sage text-center">Billing is admin-only.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1
            className="text-2xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Billing
          </h1>
          {isAdmin && (
            <button
              onClick={() =>
                tab === "plant_orders" ? setShowPoTemplate(true) : setShowTemplate(true)
              }
              className="flex items-center gap-1.5 px-3 py-2 border border-stone text-charcoal rounded-xl text-sm hover:bg-cream"
            >
              <Pencil size={14} /> Edit template
            </button>
          )}
        </div>

        {/* Combined totals across both business lines */}
        <div className="mb-3">
          <p className="text-[10px] text-sage uppercase tracking-wider mb-1">
            All billing · {monthLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            <Pill label="Billed" amount={totals.billed + poTotals.revenue} tone="neutral" />
            <Pill label="Received" amount={totals.paid + poTotals.paid} tone="forest" />
            <Pill label="Pending" amount={totals.due + poTotals.outstanding} tone="terra" />
          </div>
        </div>

        {/* Tab toggle */}
        <div className="inline-flex rounded-xl border border-stone bg-cream p-0.5 mb-3">
          {([
            ["care_plans", "Care Plans"],
            ["plant_orders", "Plant Orders"],
          ] as [BillingTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? "bg-forest text-offwhite" : "text-charcoal hover:bg-offwhite"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <MonthPicker month={month} label={monthLabel} onChange={setMonth} />

        {tab === "care_plans" ? (
          <TotalsStrip totals={totals} />
        ) : (
          <div className="flex flex-wrap gap-2 justify-end">
            <Pill label="Revenue" amount={poTotals.revenue} tone="neutral" />
            <Pill label="Paid" amount={poTotals.paid} tone="forest" />
            <Pill label="Outstanding" amount={poTotals.outstanding} tone="terra" />
          </div>
        )}
      </div>

      {tab === "plant_orders" ? (
        <div className="px-4 pt-4">
          {!canView ? (
            <p className="text-sm text-sage text-center py-10">Loading…</p>
          ) : (
            <PlantOrderBillingList
              rows={poRows}
              template={poTemplate}
              loading={poLoading}
              monthLabel={monthLabel}
              onChanged={loadPlantOrders}
            />
          )}
        </div>
      ) : (
      <div className="px-4 pt-4">
        {!canView ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : loading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-stone text-center py-10">
            No active subscriptions in this period.
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {rows.map((row) => (
                <MobileRow
                  key={row.subscription_id}
                  row={row}
                  template={template}
                  month={month}
                  isAdmin={isAdmin}
                  error={rowError[row.subscription_id]}
                  isDraftOpen={!!expandedDraft[row.subscription_id]}
                  onToggleDraft={() =>
                    setExpandedDraft((p) => ({
                      ...p,
                      [row.subscription_id]: !p[row.subscription_id],
                    }))
                  }
                  onAmountSave={(v) => handleAmountSave(row, v)}
                  onPaidToggle={(b) => handlePaidToggle(row, b)}
                  onSendWa={() => handleSendWa(row)}
                />
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-offwhite border border-stone/60 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-cream text-xs text-sage uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Customer</th>
                    <th className="text-left px-3 py-2 font-medium">Plan</th>
                    <th className="text-right px-3 py-2 font-medium">Plan ₹</th>
                    <th className="text-left px-3 py-2 font-medium">Frequency</th>
                    <th className="text-left px-3 py-2 font-medium">Invoice ₹</th>
                    <th className="text-left px-3 py-2 font-medium">Draft</th>
                    <th className="text-left px-3 py-2 font-medium">WhatsApp</th>
                    <th className="text-left px-3 py-2 font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <DesktopRow
                      key={row.subscription_id}
                      row={row}
                      template={template}
                      month={month}
                      isAdmin={isAdmin}
                      error={rowError[row.subscription_id]}
                      isDraftOpen={!!expandedDraft[row.subscription_id]}
                      onToggleDraft={() =>
                        setExpandedDraft((p) => ({
                          ...p,
                          [row.subscription_id]: !p[row.subscription_id],
                        }))
                      }
                      onAmountSave={(v) => handleAmountSave(row, v)}
                      onPaidToggle={(b) => handlePaidToggle(row, b)}
                      onSendWa={() => handleSendWa(row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      )}

      {showTemplate && isAdmin && tab === "care_plans" && (
        <EditTemplateModal
          initial={template}
          sampleRow={rows[0]}
          month={month}
          onClose={() => setShowTemplate(false)}
          onSaved={(next) => {
            setTemplate(next);
            setShowTemplate(false);
          }}
        />
      )}

      {showPoTemplate && isAdmin && (
        <PlantInvoiceTemplateModal
          initialTemplate={poTemplate}
          initialServiceLines={poServiceLines}
          initialFooterNote={poFooterNote}
          onClose={() => setShowPoTemplate(false)}
          onSaved={(t, lines, note) => {
            setPoTemplate(t);
            setPoServiceLines(lines);
            setPoFooterNote(note);
            setShowPoTemplate(false);
          }}
        />
      )}
    </div>
  );
}

function MonthPicker({
  month,
  label,
  onChange,
}: {
  month: string;
  label: string;
  onChange: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div className="flex items-center gap-2 mb-3">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        className="p-1.5 rounded-lg border border-stone hover:bg-cream text-charcoal"
        aria-label="Previous month"
      >
        <ChevronLeft size={16} />
      </button>
      {editing ? (
        <input
          ref={inputRef}
          type="month"
          value={month}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          className="px-2 py-1 border border-stone rounded-lg text-sm bg-offwhite text-charcoal focus:outline-none focus:border-forest"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 text-sm text-charcoal font-medium min-w-[140px] text-center hover:bg-cream rounded-lg"
        >
          {label}
        </button>
      )}
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        className="p-1.5 rounded-lg border border-stone hover:bg-cream text-charcoal"
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function TotalsStrip({ totals }: { totals: Totals }) {
  return (
    <div className="flex flex-wrap gap-2 justify-end">
      <Pill label="Billed" amount={totals.billed} tone="neutral" />
      <Pill label="Paid" amount={totals.paid} tone="forest" />
      <Pill label="Due" amount={totals.due} tone="terra" />
    </div>
  );
}

function Pill({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: number;
  tone: "neutral" | "forest" | "terra";
}) {
  const cls =
    tone === "forest"
      ? "bg-forest/10 text-forest border-forest/30"
      : tone === "terra"
      ? "bg-terra/10 text-terra border-terra/30"
      : "bg-cream text-charcoal border-stone";
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${cls}`}>
      {label} ₹{amount.toLocaleString("en-IN")}
    </span>
  );
}

function DraftPreview({
  template,
  row,
  month,
}: {
  template: string;
  row: Row;
  month: string;
}) {
  const draft = useMemo(() => buildDraft(template, row, month), [template, row, month]);
  return (
    <pre className="whitespace-pre-wrap text-xs text-charcoal bg-cream/60 border border-stone/40 rounded-xl p-3 font-sans">
      {draft}
    </pre>
  );
}

function SendWhatsAppButton({
  row,
  onSend,
}: {
  row: Row;
  onSend: () => void;
}) {
  const disabled = !row.phone_number;
  return (
    <button
      onClick={onSend}
      disabled={disabled}
      title={disabled ? "No phone on file." : undefined}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border ${
        disabled
          ? "border-stone text-stone cursor-not-allowed"
          : "bg-forest text-offwhite border-forest hover:bg-garden"
      }`}
    >
      <Send size={12} /> Send WhatsApp
    </button>
  );
}

function DesktopRow({
  row,
  template,
  month,
  isAdmin,
  error,
  isDraftOpen,
  onToggleDraft,
  onAmountSave,
  onPaidToggle,
  onSendWa,
}: {
  row: Row;
  template: string;
  month: string;
  isAdmin: boolean;
  error?: string;
  isDraftOpen: boolean;
  onToggleDraft: () => void;
  onAmountSave: (v: string) => void;
  onPaidToggle: (b: boolean) => void;
  onSendWa: () => void;
}) {
  const [amount, setAmount] = useState(String(row.amount_inr));
  useEffect(() => {
    setAmount(String(row.amount_inr));
  }, [row.amount_inr]);

  return (
    <>
      <tr className="border-t border-stone/40 align-top">
        <td className="px-3 py-3 text-charcoal font-medium">
          <span className="inline-flex items-center gap-2">
            {row.customer_name}
            <NewCustomerBadge createdAt={row.customer_created_at} />
          </span>
        </td>
        <td className="px-3 py-3 text-charcoal">{row.plan_name}</td>
        <td className="px-3 py-3 text-right text-charcoal tabular-nums">
          ₹{row.plan_price.toLocaleString("en-IN")}
        </td>
        <td className="px-3 py-3 text-charcoal">
          {formatPlanFrequency(row.visit_frequency)}
        </td>
        <td className="px-3 py-3 w-[120px]">
          <input
            type="number"
            min={0}
            step={1}
            disabled={!isAdmin}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => onAmountSave(amount)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className={`${inputCls} ${!isAdmin ? "opacity-60" : ""}`}
          />
        </td>
        <td className="px-3 py-3">
          <button
            onClick={onToggleDraft}
            className="inline-flex items-center gap-1 text-xs text-charcoal hover:text-forest"
          >
            Preview {isDraftOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </td>
        <td className="px-3 py-3">
          <SendWhatsAppButton row={row} onSend={onSendWa} />
          {row.last_reminder_sent_at && (
            <p className="text-[10px] text-sage mt-1">
              Sent {formatDate(row.last_reminder_sent_at.slice(0, 10))}
            </p>
          )}
        </td>
        <td className="px-3 py-3">
          <label className={`inline-flex items-center gap-2 ${isAdmin ? "" : "opacity-60"}`}>
            <input
              type="checkbox"
              checked={row.is_paid}
              disabled={!isAdmin}
              onChange={(e) => onPaidToggle(e.target.checked)}
              className="w-4 h-4 accent-forest"
            />
            <span className="text-xs text-charcoal">Paid</span>
          </label>
          {row.is_paid && row.paid_at && (
            <p className="text-[10px] text-sage mt-1">
              {formatDate(row.paid_at.slice(0, 10))}
            </p>
          )}
        </td>
      </tr>
      {isDraftOpen && (
        <tr className="bg-cream/50">
          <td colSpan={8} className="px-3 py-3">
            <DraftPreview template={template} row={row} month={month} />
          </td>
        </tr>
      )}
      {error && (
        <tr>
          <td colSpan={8} className="px-3 pb-2">
            <p className="text-xs text-terra">{error}</p>
          </td>
        </tr>
      )}
    </>
  );
}

function MobileRow({
  row,
  template,
  month,
  isAdmin,
  error,
  isDraftOpen,
  onToggleDraft,
  onAmountSave,
  onPaidToggle,
  onSendWa,
}: {
  row: Row;
  template: string;
  month: string;
  isAdmin: boolean;
  error?: string;
  isDraftOpen: boolean;
  onToggleDraft: () => void;
  onAmountSave: (v: string) => void;
  onPaidToggle: (b: boolean) => void;
  onSendWa: () => void;
}) {
  const [amount, setAmount] = useState(String(row.amount_inr));
  useEffect(() => {
    setAmount(String(row.amount_inr));
  }, [row.amount_inr]);

  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-charcoal text-sm">{row.customer_name}</p>
            <NewCustomerBadge createdAt={row.customer_created_at} />
          </div>
          <p className="text-xs text-sage">
            {row.plan_name} · ₹{row.plan_price.toLocaleString("en-IN")} ·{" "}
            {formatPlanFrequency(row.visit_frequency)}
          </p>
        </div>
        <label className={`flex items-center gap-1.5 ${isAdmin ? "" : "opacity-60"}`}>
          <input
            type="checkbox"
            checked={row.is_paid}
            disabled={!isAdmin}
            onChange={(e) => onPaidToggle(e.target.checked)}
            className="w-4 h-4 accent-forest"
          />
          <span className="text-xs text-charcoal">Paid</span>
        </label>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
            Invoice
          </label>
          <input
            type="number"
            min={0}
            step={1}
            disabled={!isAdmin}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => onAmountSave(amount)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className={`${inputCls} ${!isAdmin ? "opacity-60" : ""}`}
          />
        </div>
        {row.is_paid && row.paid_at && (
          <p className="text-[10px] text-sage pb-2">
            Paid {formatDate(row.paid_at.slice(0, 10))}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onToggleDraft}
          className="inline-flex items-center gap-1 text-xs text-charcoal hover:text-forest"
        >
          Preview draft{" "}
          {isDraftOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        <SendWhatsAppButton row={row} onSend={onSendWa} />
      </div>

      {isDraftOpen && (
        <DraftPreview template={template} row={row} month={month} />
      )}

      {row.last_reminder_sent_at && (
        <p className="text-[10px] text-sage">
          Last sent {formatDate(row.last_reminder_sent_at.slice(0, 10))}
        </p>
      )}

      {error && <p className="text-xs text-terra">{error}</p>}
    </div>
  );
}

function EditTemplateModal({
  initial,
  sampleRow,
  month,
  onClose,
  onSaved,
}: {
  initial: string;
  sampleRow: Row | undefined;
  month: string;
  onClose: () => void;
  onSaved: (next: string) => void;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewRow: Row = useMemo(
    () =>
      sampleRow ?? {
        subscription_id: "sample",
        customer_id: "sample",
        customer_name: "Rakesh Kumar",
        customer_created_at: null,
        phone_number: null,
        plan_name: "Growth",
        plan_price: 1099,
        visit_frequency: "weekly",
        default_amount_inr: 2199,
        bill_id: null,
        amount_inr: 2199,
        is_paid: false,
        paid_at: null,
        last_reminder_sent_at: null,
      },
    [sampleRow]
  );

  const preview = useMemo(
    () => buildDraft(text, previewRow, month),
    [text, previewRow, month]
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/system-config/billing-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: text }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save");
        setSaving(false);
        return;
      }
      onSaved(json.data?.template ?? text);
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 pb-20 md:pb-0 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[560px] p-6 max-h-[85vh] overflow-y-auto mb-16 md:mb-0">
        <h2
          className="text-lg text-charcoal mb-4"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Edit WhatsApp template
        </h2>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest font-mono"
        />

        <div className="mt-3">
          <p className="text-[10px] text-sage uppercase tracking-wider mb-1">
            Tokens
          </p>
          <ul className="text-xs text-charcoal space-y-0.5">
            {BILLING_TEMPLATE_TOKEN_HELP.map((t) => (
              <li key={t.token}>
                <code className="bg-cream px-1 rounded">{`{${t.token}}`}</code>{" "}
                — {t.description}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <p className="text-[10px] text-sage uppercase tracking-wider mb-1">
            Preview
          </p>
          <pre className="whitespace-pre-wrap text-xs text-charcoal bg-cream/60 border border-stone/40 rounded-xl p-3 font-sans">
            {preview}
          </pre>
        </div>

        {error && <p className="text-sm text-terra mt-3">{error}</p>}

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
