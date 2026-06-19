"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Paperclip,
  Loader2,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { currentMonthKey, formatMonthLabel } from "@/lib/billing/template";
import { compressImage } from "@/lib/utils/compress-image";
import {
  OPERATIONAL_CATEGORIES,
  categoryLabel,
  operationalGroup,
  type OperationalCategory,
  type OperationalGroup,
} from "@/lib/expenses/categories";

type Row = {
  id: string;
  category: OperationalCategory;
  category_group: OperationalGroup;
  amount_inr: number;
  description: string | null;
  payee_name: string | null;
  is_paid: boolean;
  paid_at: string | null;
  receipt_url: string | null;
  submitted_by_name: string;
  submitted_by_id: string;
  status: "active" | "voided";
  created_at: string;
};

type GroupTotal = { recorded: number; paid: number };
type Totals = {
  inputs: GroupTotal;
  plant_procurement: GroupTotal;
  all: GroupTotal;
};

type Filter = "all" | "inputs" | "plant_procurement";

const inputCls =
  "w-full px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const emptyTotals: Totals = {
  inputs: { recorded: 0, paid: 0 },
  plant_procurement: { recorded: 0, paid: 0 },
  all: { recorded: 0, paid: 0 },
};

function computeTotals(rows: Row[]): Totals {
  const t: Totals = {
    inputs: { recorded: 0, paid: 0 },
    plant_procurement: { recorded: 0, paid: 0 },
    all: { recorded: 0, paid: 0 },
  };
  for (const r of rows) {
    if (r.status !== "active") continue;
    const g = t[r.category_group];
    g.recorded += r.amount_inr;
    t.all.recorded += r.amount_inr;
    if (r.is_paid) {
      g.paid += r.amount_inr;
      t.all.paid += r.amount_inr;
    }
  }
  return t;
}

export default function ExpensesPage() {
  const [month, setMonth] = useState<string>(() => currentMonthKey());
  const [monthLabel, setMonthLabel] = useState<string>(
    formatMonthLabel(currentMonthKey())
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>(emptyTotals);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<
    "admin" | "horticulturist" | "gardener" | null
  >(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showVoided, setShowVoided] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const isAdmin = role === "admin";
  const canView = role === "admin" || role === "horticulturist";

  useEffect(() => {
    fetch("/api/ops/people/me/role")
      .then((r) => r.json())
      .then((d) => {
        setRole(d.data?.role ?? null);
        setMyId(d.data?.user_id ?? null);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ops/expenses?month=${month}&include_voided=${showVoided}`
      );
      if (!res.ok) {
        setRows([]);
        setTotals(emptyTotals);
        setMonthLabel(formatMonthLabel(month));
        return;
      }
      const json = await res.json();
      setRows(json.data?.rows ?? []);
      setTotals(json.data?.totals ?? emptyTotals);
      setMonthLabel(json.data?.month_label ?? formatMonthLabel(month));
    } finally {
      setLoading(false);
    }
  }, [month, showVoided]);

  useEffect(() => {
    if (canView) load();
  }, [load, canView]);

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

  function canEdit(row: Row): boolean {
    return isAdmin || row.submitted_by_id === myId;
  }

  async function handlePaidToggle(row: Row, paid: boolean) {
    const prev = rows;
    const optimistic = rows.map((r) =>
      r.id === row.id
        ? {
            ...r,
            is_paid: paid,
            paid_at: paid ? new Date().toISOString() : null,
          }
        : r
    );
    setRows(optimistic);
    setTotals(computeTotals(optimistic));
    try {
      const res = await fetch(`/api/ops/expenses/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_paid: paid }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRows(prev);
        setTotals(computeTotals(prev));
        setRowErr(row.id, json.error ?? "Update failed");
      }
    } catch {
      setRows(prev);
      setTotals(computeTotals(prev));
      setRowErr(row.id, "Network error");
    }
  }

  async function handleVoid(row: Row) {
    if (
      !window.confirm(
        `Void this ${categoryLabel(row.category).toLowerCase()} expense of ₹${row.amount_inr.toLocaleString(
          "en-IN"
        )}? It will be excluded from totals.`
      )
    )
      return;
    const prev = rows;
    try {
      const res = await fetch(`/api/ops/expenses/${row.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRowErr(row.id, json.error ?? "Void failed");
        return;
      }
      load();
    } catch {
      setRows(prev);
      setRowErr(row.id, "Network error");
    }
  }

  const visibleRows = rows.filter(
    (r) => filter === "all" || r.category_group === filter
  );

  if (role !== null && !canView) {
    return (
      <div className="min-h-screen bg-cream px-4 py-10">
        <p className="text-sm text-sage text-center">
          Expenses is for admin &amp; horticulturist only.
        </p>
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
            Expenses
          </h1>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
          >
            <Plus size={14} /> New expense
          </button>
        </div>

        <MonthPicker month={month} label={monthLabel} onChange={setMonth} />

        {/* Category filter pills */}
        <div className="inline-flex rounded-xl border border-stone bg-cream p-0.5 mb-3">
          {(
            [
              ["inputs", "Inputs"],
              ["plant_procurement", "Plant procurement"],
              ["all", "All"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === key
                  ? "bg-forest text-offwhite"
                  : "text-charcoal hover:bg-offwhite"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Totals strip — same three-pill pattern as Care Plans / Plant Orders */}
        <div className="flex flex-wrap gap-2 justify-end">
          <Pill label="Recorded" amount={totals.all.recorded} tone="neutral" />
          <Pill label="Paid" amount={totals.all.paid} tone="forest" />
          <Pill
            label="Pending"
            amount={totals.all.recorded - totals.all.paid}
            tone="terra"
          />
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-center justify-end mb-3">
          <label className="flex items-center gap-1.5 text-xs text-sage">
            <input
              type="checkbox"
              checked={showVoided}
              onChange={(e) => setShowVoided(e.target.checked)}
              className="w-3.5 h-3.5 accent-forest"
            />
            Show voided
          </label>
        </div>

        {!canView || loading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-stone text-center py-10">
            No expenses recorded for {monthLabel}.
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {visibleRows.map((row) => (
                <MobileCard
                  key={row.id}
                  row={row}
                  canEdit={canEdit(row)}
                  error={rowError[row.id]}
                  onPaidToggle={(b) => handlePaidToggle(row, b)}
                  onEdit={() => setEditRow(row)}
                  onVoid={() => handleVoid(row)}
                />
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-offwhite border border-stone/60 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-cream text-xs text-sage uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-left px-3 py-2 font-medium">Payee</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                    <th className="text-left px-3 py-2 font-medium">Paid</th>
                    <th className="text-left px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <DesktopRow
                      key={row.id}
                      row={row}
                      canEdit={canEdit(row)}
                      error={rowError[row.id]}
                      onPaidToggle={(b) => handlePaidToggle(row, b)}
                      onEdit={() => setEditRow(row)}
                      onVoid={() => handleVoid(row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <ExpenseModal
          mode="create"
          month={month}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {editRow && (
        <ExpenseModal
          mode="edit"
          month={month}
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={() => {
            setEditRow(null);
            load();
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

function PaidCheckbox({
  row,
  canEdit,
  onToggle,
}: {
  row: Row;
  canEdit: boolean;
  onToggle: (b: boolean) => void;
}) {
  return (
    <label className={`inline-flex items-center gap-2 ${canEdit ? "" : "opacity-60"}`}>
      <input
        type="checkbox"
        checked={row.is_paid}
        disabled={!canEdit || row.status === "voided"}
        onChange={(e) => onToggle(e.target.checked)}
        className="w-4 h-4 accent-forest"
      />
      <span className="text-xs text-charcoal">Paid</span>
    </label>
  );
}

function RowActions({
  row,
  canEdit,
  onEdit,
  onVoid,
}: {
  row: Row;
  canEdit: boolean;
  onEdit: () => void;
  onVoid: () => void;
}) {
  if (!canEdit || row.status === "voided") return null;
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onEdit}
        className="p-1.5 rounded-lg border border-stone text-charcoal hover:bg-cream"
        aria-label="Edit expense"
        title="Edit"
      >
        <Pencil size={13} />
      </button>
      <button
        onClick={onVoid}
        className="p-1.5 rounded-lg border border-stone text-terra hover:bg-terra/10"
        aria-label="Void expense"
        title="Void"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function DesktopRow({
  row,
  canEdit,
  error,
  onPaidToggle,
  onEdit,
  onVoid,
}: {
  row: Row;
  canEdit: boolean;
  error?: string;
  onPaidToggle: (b: boolean) => void;
  onEdit: () => void;
  onVoid: () => void;
}) {
  const voided = row.status === "voided";
  return (
    <>
      <tr
        className={`border-t border-stone/40 align-top ${
          voided ? "opacity-50 line-through" : ""
        }`}
      >
        <td className="px-3 py-3 text-charcoal whitespace-nowrap">
          {formatDate(row.created_at.slice(0, 10))}
        </td>
        <td className="px-3 py-3 text-charcoal">{categoryLabel(row.category)}</td>
        <td className="px-3 py-3 text-charcoal">
          {row.description || "—"}
          {row.receipt_url && (
            <a
              href={row.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 ml-2 text-xs text-forest no-underline hover:underline"
            >
              <Paperclip size={11} /> receipt
            </a>
          )}
          <span className="block text-[10px] text-sage">
            by {row.submitted_by_name}
          </span>
        </td>
        <td className="px-3 py-3 text-charcoal">{row.payee_name || "—"}</td>
        <td className="px-3 py-3 text-right text-charcoal tabular-nums">
          ₹{row.amount_inr.toLocaleString("en-IN")}
        </td>
        <td className="px-3 py-3">
          <PaidCheckbox row={row} canEdit={canEdit} onToggle={onPaidToggle} />
          {row.is_paid && row.paid_at && (
            <p className="text-[10px] text-sage mt-1 no-underline">
              {formatDate(row.paid_at.slice(0, 10))}
            </p>
          )}
        </td>
        <td className="px-3 py-3">
          <RowActions row={row} canEdit={canEdit} onEdit={onEdit} onVoid={onVoid} />
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={7} className="px-3 pb-2">
            <p className="text-xs text-terra">{error}</p>
          </td>
        </tr>
      )}
    </>
  );
}

function MobileCard({
  row,
  canEdit,
  error,
  onPaidToggle,
  onEdit,
  onVoid,
}: {
  row: Row;
  canEdit: boolean;
  error?: string;
  onPaidToggle: (b: boolean) => void;
  onEdit: () => void;
  onVoid: () => void;
}) {
  const voided = row.status === "voided";
  return (
    <div
      className={`bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 space-y-2 ${
        voided ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={voided ? "line-through" : ""}>
          <p className="font-medium text-charcoal text-sm">
            {categoryLabel(row.category)}
          </p>
          <p className="text-xs text-sage">
            {formatDate(row.created_at.slice(0, 10))}
            {row.payee_name ? ` · ${row.payee_name}` : ""}
          </p>
        </div>
        <p className="text-charcoal font-medium tabular-nums">
          ₹{row.amount_inr.toLocaleString("en-IN")}
        </p>
      </div>

      {row.description && (
        <p className={`text-sm text-charcoal ${voided ? "line-through" : ""}`}>
          {row.description}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <PaidCheckbox row={row} canEdit={canEdit} onToggle={onPaidToggle} />
        <div className="flex items-center gap-2">
          {row.receipt_url && (
            <a
              href={row.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-forest"
            >
              <Paperclip size={12} /> receipt
            </a>
          )}
          <RowActions row={row} canEdit={canEdit} onEdit={onEdit} onVoid={onVoid} />
        </div>
      </div>

      <p className="text-[10px] text-sage">by {row.submitted_by_name}</p>
      {error && <p className="text-xs text-terra">{error}</p>}
    </div>
  );
}

function ExpenseModal({
  mode,
  month,
  row,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  month: string;
  row?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<OperationalCategory>(
    row?.category ?? "garden_input"
  );
  const [expenseMonth, setExpenseMonth] = useState<string>(month);
  const [amount, setAmount] = useState<string>(
    row ? String(row.amount_inr) : ""
  );
  const [description, setDescription] = useState<string>(row?.description ?? "");
  const [payee, setPayee] = useState<string>(row?.payee_name ?? "");
  const [isPaid, setIsPaid] = useState<boolean>(row?.is_paid ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadReceipt(): Promise<string | null> {
    if (!file) return null;
    const compressed = await compressImage(file);
    const fd = new FormData();
    fd.append("receipt", compressed);
    const res = await fetch("/api/ops/expenses/receipt", {
      method: "POST",
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Receipt upload failed");
    return json.data?.path ?? null;
  }

  async function handleSave() {
    const amountNum = Math.round(Number(amount));
    if (!amountNum || amountNum < 1 || Number.isNaN(amountNum)) {
      setError("Enter an amount of ₹1 or more.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let receiptPath: string | null = null;
      try {
        receiptPath = await uploadReceipt();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Receipt upload failed");
        setSaving(false);
        return;
      }

      if (mode === "create") {
        const res = await fetch("/api/ops/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            expense_month: expenseMonth,
            amount_inr: amountNum,
            description: description.trim() || undefined,
            payee_name: payee.trim() || undefined,
            is_paid: isPaid,
            receipt_path: receiptPath ?? undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Failed to save");
          setSaving(false);
          return;
        }
      } else if (row) {
        const body: Record<string, unknown> = {
          category,
          amount_inr: amountNum,
          description: description.trim() || null,
          payee_name: payee.trim() || null,
          is_paid: isPaid,
        };
        if (receiptPath) body.receipt_path = receiptPath;
        const res = await fetch(`/api/ops/expenses/${row.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Failed to save");
          setSaving(false);
          return;
        }
      }
      onSaved();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 pb-20 md:pb-0 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6 max-h-[85vh] overflow-y-auto mb-16 md:mb-0">
        <h2
          className="text-lg text-charcoal mb-4"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          {mode === "create" ? "New expense" : "Edit expense"}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as OperationalCategory)}
              className={inputCls}
            >
              {OPERATIONAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)} (
                  {operationalGroup(c) === "inputs"
                    ? "inputs"
                    : "plant procurement"}
                  )
                </option>
              ))}
            </select>
          </div>

          {mode === "create" && (
            <div>
              <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
                Month
              </label>
              <input
                type="month"
                value={expenseMonth}
                onChange={(e) => setExpenseMonth(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
              Amount (₹)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputCls}
              placeholder="0"
            />
          </div>

          <div>
            <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
              Description
            </label>
            <input
              type="text"
              maxLength={280}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputCls}
              placeholder="e.g. Vermicompost 10kg"
            />
          </div>

          <div>
            <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
              Payee / vendor
            </label>
            <input
              type="text"
              maxLength={120}
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              className={inputCls}
              placeholder="e.g. GreenCo Nursery"
            />
          </div>

          <div>
            <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
              Receipt (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-charcoal"
            />
            {mode === "edit" && row?.receipt_url && !file && (
              <p className="text-[10px] text-sage mt-1">
                A receipt is already attached. Choosing a new file replaces it.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={isPaid}
              onChange={(e) => setIsPaid(e.target.checked)}
              className="w-4 h-4 accent-forest"
            />
            <span className="text-sm text-charcoal">Already paid</span>
          </label>
        </div>

        {error && <p className="text-sm text-terra mt-3">{error}</p>}

        <div className="flex gap-3 pt-5">
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
            className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
