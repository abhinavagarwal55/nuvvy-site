"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Check, AlertCircle, FileText, ChevronRight } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils/format-date";

type Bill = {
  id: string;
  customer_id: string;
  customer_name: string;
  amount_inr: number;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  status: string;
  is_overdue: boolean;
  paid_at: string | null;
  last_reminder_sent_at: string | null;
  notes: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  customer_id: string;
  plant_order_id: string | null;
  status: string;
  total: number;
  paid_at: string | null;
  created_at: string;
  customer_name: string | null;
};

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

export default function BillingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"bills" | "invoices">("bills");
  const [bills, setBills] = useState<Bill[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [showCreate, setShowCreate] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/ops/people/me/role")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.data?.role === "admin"))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    if (tab === "bills") {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/ops/billing${params}`);
      const json = await res.json();
      setBills(json.data ?? []);
    } else {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/ops/invoices${params}`);
      const json = await res.json();
      setInvoices(json.data ?? []);
    }
    setLoading(false);
  }, [statusFilter, tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkPaid(billId: string) {
    const res = await fetch(`/api/ops/billing/${billId}/mark-paid`, { method: "POST" });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to mark as paid");
      return;
    }
    load();
  }

  async function handleRemind(bill: Bill) {
    const res = await fetch(`/api/ops/billing/${bill.id}/remind`, { method: "POST" });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to send reminder");
      return;
    }

    // Copy reminder text
    const msg = `Hi ${bill.customer_name}, this is a gentle reminder about your Nuvvy garden care payment of ₹${bill.amount_inr} for the period ${formatDate(bill.billing_period_start)} to ${formatDate(bill.billing_period_end)}. Due date: ${formatDate(bill.due_date)}. Please let us know once done! — Team Nuvvy`;
    await navigator.clipboard.writeText(msg);
    load();
  }

  const overdue = bills.filter((b) => b.is_overdue);
  const pending = bills.filter((b) => !b.is_overdue && b.status === "pending");
  const paid = bills.filter((b) => b.status === "paid");

  const invoiceStatusFilters = tab === "invoices"
    ? ["draft", "finalized", "paid", "all"]
    : ["pending", "paid", "all"];

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
          {isAdmin && tab === "bills" && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
            >
              <Plus size={16} /> New Bill
            </button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-3">
          {(["bills", "invoices"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setStatusFilter(t === "invoices" ? "draft" : "pending"); }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                tab === t
                  ? "bg-forest text-offwhite border-forest"
                  : "bg-offwhite text-charcoal border-stone"
              }`}
            >
              {t === "bills" ? "Subscription Bills" : "Plant Invoices"}
            </button>
          ))}
        </div>

        {/* Status filters */}
        <div className="flex gap-2">
          {(tab === "invoices" ? invoiceStatusFilters : ["pending", "paid", "all"]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                statusFilter === s
                  ? "bg-charcoal text-offwhite border-charcoal"
                  : "bg-cream text-charcoal border-stone"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-5">
        {loading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : tab === "bills" ? (
          /* Bills view */
          bills.length === 0 ? (
            <p className="text-sm text-stone text-center py-10">No bills found.</p>
          ) : (
            <>
              {overdue.length > 0 && statusFilter !== "paid" && (
                <Section title="Overdue" count={overdue.length}>
                  {overdue.map((b) => (
                    <BillCard
                      key={b.id}
                      bill={b}
                      isAdmin={isAdmin}
                      onMarkPaid={handleMarkPaid}
                      onRemind={handleRemind}
                    />
                  ))}
                </Section>
              )}
              {pending.length > 0 && statusFilter !== "paid" && (
                <Section title="Pending" count={pending.length}>
                  {pending.map((b) => (
                    <BillCard
                      key={b.id}
                      bill={b}
                      isAdmin={isAdmin}
                      onMarkPaid={handleMarkPaid}
                      onRemind={handleRemind}
                    />
                  ))}
                </Section>
              )}
              {paid.length > 0 && statusFilter !== "pending" && (
                <Section title="Paid" count={paid.length}>
                  {paid.map((b) => (
                    <BillCard
                      key={b.id}
                      bill={b}
                      isAdmin={isAdmin}
                      onMarkPaid={handleMarkPaid}
                      onRemind={handleRemind}
                    />
                  ))}
                </Section>
              )}
            </>
          )
        ) : (
          /* Invoices view */
          invoices.length === 0 ? (
            <p className="text-sm text-stone text-center py-10">No invoices found.</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <InvoiceCard key={inv.id} invoice={inv} onClick={() => router.push(`/ops/invoices/${inv.id}`)} />
              ))}
            </div>
          )
        )}
      </div>

      {showCreate && (
        <CreateBillModal onClose={() => setShowCreate(false)} onSaved={load} />
      )}
    </div>
  );
}

function BillCard({
  bill,
  isAdmin,
  onMarkPaid,
  onRemind,
}: {
  bill: Bill;
  isAdmin: boolean;
  onMarkPaid: (id: string) => void;
  onRemind: (b: Bill) => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className={`bg-offwhite rounded-2xl border px-4 py-3 space-y-2 ${
        bill.is_overdue ? "border-terra/40" : "border-stone/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-charcoal text-sm">{bill.customer_name}</p>
          <p className="text-xs text-sage">
            {formatDate(bill.billing_period_start)} → {formatDate(bill.billing_period_end)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-medium text-charcoal">₹{bill.amount_inr}</p>
          {bill.is_overdue && (
            <span className="text-xs text-terra flex items-center gap-1">
              <AlertCircle size={11} /> Overdue
            </span>
          )}
          {bill.status === "paid" && (
            <span className="text-xs text-sage">Paid</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-sage">
        <span>Due: {formatDate(bill.due_date)}</span>
        {bill.last_reminder_sent_at && (
          <span>
            · Reminded{" "}
            {formatDateTime(bill.last_reminder_sent_at)}
          </span>
        )}
      </div>

      {bill.status === "pending" && (
        <div className="flex items-center gap-3 pt-1 border-t border-stone/30">
          {isAdmin && (
            <button
              onClick={() => onMarkPaid(bill.id)}
              className="flex items-center gap-1 text-xs text-forest font-medium hover:text-garden"
            >
              <Check size={12} /> Mark Paid
            </button>
          )}
          <button
            onClick={() => {
              onRemind(bill);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1 text-xs text-charcoal font-medium hover:text-forest ml-auto"
          >
            <Copy size={12} /> {copied ? "Copied!" : "Send Reminder"}
          </button>
        </div>
      )}
    </div>
  );
}

function CreateBillModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/ops/customers?status=ACTIVE")
      .then((r) => r.json())
      .then((d) => setCustomers(d.data ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch("/api/ops/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        amount_inr: parseInt(amount),
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        due_date: dueDate,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error);
      setSaving(false);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6 max-h-[80vh] overflow-y-auto">
        <h2
          className="text-lg text-charcoal mb-4"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          New Bill
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              Customer <span className="text-terra">*</span>
            </label>
            <select
              className={inputCls}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              Amount (₹) <span className="text-terra">*</span>
            </label>
            <input
              className={inputCls}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="799"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Period start
              </label>
              <input
                type="date"
                className={inputCls}
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Period end
              </label>
              <input
                type="date"
                className={inputCls}
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              Due date
            </label>
            <input
              type="date"
              className={inputCls}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-terra">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40"
            >
              {saving ? "Creating…" : "Create Bill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const INVOICE_STATUS: Record<string, { cls: string; label: string }> = {
  draft: { cls: "bg-amber-50 text-amber-700", label: "Draft" },
  finalized: { cls: "bg-blue-50 text-blue-700", label: "Finalized" },
  paid: { cls: "bg-forest/10 text-forest", label: "Paid" },
};

function InvoiceCard({
  invoice,
  onClick,
}: {
  invoice: Invoice;
  onClick: () => void;
}) {
  const badge = INVOICE_STATUS[invoice.status] ?? { cls: "bg-stone/20 text-charcoal", label: invoice.status };
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 hover:border-forest/40 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-forest/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText size={18} className="text-forest" />
          </div>
          <div>
            <p className="text-sm font-medium text-charcoal">{invoice.customer_name ?? "Customer"}</p>
            <p className="text-xs text-sage">{invoice.invoice_number} · {formatDate(invoice.created_at.split("T")[0])}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-semibold text-charcoal">₹{invoice.total.toLocaleString("en-IN")}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
          </div>
          <ChevronRight size={16} className="text-stone" />
        </div>
      </div>
    </button>
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
