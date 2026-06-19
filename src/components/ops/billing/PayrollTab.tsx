"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Loader2 } from "lucide-react";
import { categoryLabel, PAYROLL_CATEGORIES, type PayrollCategory } from "@/lib/expenses/categories";

type Row = {
  compensation_id: string | null;
  expense_id: string | null;
  category: PayrollCategory;
  payee_name: string;
  payee_profile_id: string | null;
  is_people_member: boolean;
  person_status: "active" | "inactive" | null;
  default_amount_inr: number;
  amount_inr: number;
  is_paid: boolean;
  paid_at: string | null;
  notes: string | null;
};

type CatTotal = { recorded: number; paid: number };
type Totals = {
  salary: CatTotal;
  consultant: CatTotal;
  overhead: CatTotal;
  all: CatTotal;
};

const emptyTotals: Totals = {
  salary: { recorded: 0, paid: 0 },
  consultant: { recorded: 0, paid: 0 },
  overhead: { recorded: 0, paid: 0 },
  all: { recorded: 0, paid: 0 },
};

const inputCls =
  "w-full px-2 py-1.5 border border-stone rounded-lg text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest tabular-nums";

// Display INR with the Indian comma grouping + ₹ symbol; parse back to digits.
function fmtINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}
function parseINR(s: string): number {
  const digits = s.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * Currency cell: shows "₹34,000" at rest, raw digits while focused for easy
 * editing, and saves the parsed integer on blur/Enter.
 */
function AmountInput({
  value,
  onSave,
}: {
  value: number;
  onSave: (parsed: number) => void;
}) {
  const [text, setText] = useState(fmtINR(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmtINR(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onFocus={() => {
        setFocused(true);
        setText(String(parseINR(text)));
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const n = parseINR(text);
        setText(fmtINR(n));
        onSave(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={inputCls}
    />
  );
}

export default function PayrollTab({
  month,
  monthLabel,
}: {
  month: string;
  monthLabel: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>(emptyTotals);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/payroll?month=${month}`);
      if (!res.ok) {
        setRows([]);
        setTotals(emptyTotals);
        return;
      }
      const json = await res.json();
      setRows(json.data?.rows ?? []);
      setTotals(json.data?.totals ?? emptyTotals);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  function rowKey(r: Row): string {
    return r.compensation_id ?? `oneoff:${r.expense_id}`;
  }

  function setRowErr(key: string, msg: string | null) {
    setRowError((prev) => {
      const next = { ...prev };
      if (msg) next[key] = msg;
      else delete next[key];
      return next;
    });
    if (msg) {
      window.setTimeout(() => {
        setRowError((prev) => {
          if (prev[key] !== msg) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }, 4000);
    }
  }

  // Edit the per-month ("This month") amount.
  async function saveThisMonth(row: Row, raw: string) {
    const parsed = Math.max(0, Math.round(Number(raw)));
    if (Number.isNaN(parsed) || parsed === row.amount_inr) return;
    const key = rowKey(row);
    // E5: don't silently rewrite an already-paid row's amount.
    if (
      row.is_paid &&
      !window.confirm("This row is already marked paid — change the amount anyway?")
    ) {
      load();
      return;
    }
    try {
      let res: Response;
      if (row.compensation_id) {
        res = await fetch(`/api/ops/payroll/month/${row.compensation_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, amount_inr: parsed }),
        });
      } else {
        res = await fetch(`/api/ops/expenses/${row.expense_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount_inr: parsed }),
        });
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRowErr(key, json.error ?? "Update failed");
        load();
        return;
      }
      load();
    } catch {
      setRowErr(key, "Network error");
      load();
    }
  }

  // Edit the recurring monthly default (master).
  async function saveMonthly(row: Row, raw: string) {
    if (!row.compensation_id) return;
    const parsed = Math.max(0, Math.round(Number(raw)));
    if (Number.isNaN(parsed) || parsed === row.default_amount_inr) return;
    const key = rowKey(row);
    try {
      const res = await fetch(
        `/api/ops/payroll/compensation/${row.compensation_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ monthly_amount_inr: parsed }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRowErr(key, json.error ?? "Update failed");
        load();
        return;
      }
      load();
    } catch {
      setRowErr(key, "Network error");
      load();
    }
  }

  async function togglePaid(row: Row, paid: boolean) {
    const key = rowKey(row);
    try {
      let res: Response;
      if (row.compensation_id) {
        res = await fetch(`/api/ops/payroll/month/${row.compensation_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, is_paid: paid }),
        });
      } else {
        res = await fetch(`/api/ops/expenses/${row.expense_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_paid: paid }),
        });
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRowErr(key, json.error ?? "Update failed");
      }
      load();
    } catch {
      setRowErr(key, "Network error");
      load();
    }
  }

  async function deactivate(row: Row) {
    if (!row.compensation_id) return;
    if (
      !window.confirm(
        `Stop recurring ${categoryLabel(row.category).toLowerCase()} for ${row.payee_name}? Future months will no longer seed this. History is kept.`
      )
    )
      return;
    const key = rowKey(row);
    try {
      const res = await fetch(
        `/api/ops/payroll/compensation/${row.compensation_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRowErr(key, json.error ?? "Failed");
      }
      load();
    } catch {
      setRowErr(key, "Network error");
      load();
    }
  }

  return (
    <div className="px-4 pt-4">
      {/* Totals strip — same three-pill pattern as Care Plans / Plant Orders */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
        >
          <Plus size={14} /> Add salary/expense
        </button>
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

      {loading ? (
        <p className="text-sm text-sage text-center py-10">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone text-center py-10">
          No payroll or overheads for {monthLabel}.
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {rows.map((row) => (
              <PayrollCard
                key={rowKey(row)}
                row={row}
                error={rowError[rowKey(row)]}
                onSaveMonthly={(v) => saveMonthly(row, v)}
                onSaveThisMonth={(v) => saveThisMonth(row, v)}
                onTogglePaid={(b) => togglePaid(row, b)}
                onDeactivate={() => deactivate(row)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-offwhite border border-stone/60 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream text-xs text-sage uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Payee</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium">Monthly</th>
                  <th className="text-left px-3 py-2 font-medium">This month</th>
                  <th className="text-left px-3 py-2 font-medium">Paid</th>
                  <th className="text-left px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PayrollRow
                    key={rowKey(row)}
                    row={row}
                    error={rowError[rowKey(row)]}
                    onSaveMonthly={(v) => saveMonthly(row, v)}
                    onSaveThisMonth={(v) => saveThisMonth(row, v)}
                    onTogglePaid={(b) => togglePaid(row, b)}
                    onDeactivate={() => deactivate(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showAdd && (
        <AddPayrollModal
          month={month}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
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

function TypeCell({ row }: { row: Row }) {
  return (
    <span className="text-charcoal">
      {categoryLabel(row.category)}
      {!row.compensation_id && (
        <span className="text-[10px] text-sage"> (one-off)</span>
      )}
      {row.person_status === "inactive" && (
        <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-terra/10 text-terra border border-terra/30">
          inactive staff
        </span>
      )}
    </span>
  );
}

function PayrollRow({
  row,
  error,
  onSaveMonthly,
  onSaveThisMonth,
  onTogglePaid,
  onDeactivate,
}: {
  row: Row;
  error?: string;
  onSaveMonthly: (v: string) => void;
  onSaveThisMonth: (v: string) => void;
  onTogglePaid: (b: boolean) => void;
  onDeactivate: () => void;
}) {
  return (
    <>
      <tr className="border-t border-stone/40 align-top">
        <td className="px-3 py-3 text-charcoal font-medium">{row.payee_name}</td>
        <td className="px-3 py-3">
          <TypeCell row={row} />
        </td>
        <td className="px-3 py-3 w-[130px]">
          {row.compensation_id ? (
            <AmountInput
              value={row.default_amount_inr}
              onSave={(n) => onSaveMonthly(String(n))}
            />
          ) : (
            <span className="text-sage">—</span>
          )}
        </td>
        <td className="px-3 py-3 w-[130px]">
          <AmountInput
            value={row.amount_inr}
            onSave={(n) => onSaveThisMonth(String(n))}
          />
        </td>
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={row.is_paid}
            onChange={(e) => onTogglePaid(e.target.checked)}
            className="w-4 h-4 accent-forest"
          />
        </td>
        <td className="px-3 py-3">
          {row.compensation_id && (
            <button
              onClick={onDeactivate}
              className="text-xs text-terra hover:underline"
            >
              Stop
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} className="px-3 pb-2">
            <p className="text-xs text-terra">{error}</p>
          </td>
        </tr>
      )}
    </>
  );
}

function PayrollCard({
  row,
  error,
  onSaveMonthly,
  onSaveThisMonth,
  onTogglePaid,
  onDeactivate,
}: {
  row: Row;
  error?: string;
  onSaveMonthly: (v: string) => void;
  onSaveThisMonth: (v: string) => void;
  onTogglePaid: (b: boolean) => void;
  onDeactivate: () => void;
}) {
  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-charcoal text-sm">{row.payee_name}</p>
          <p className="text-xs text-sage">
            <TypeCell row={row} />
          </p>
        </div>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={row.is_paid}
            onChange={(e) => onTogglePaid(e.target.checked)}
            className="w-4 h-4 accent-forest"
          />
          <span className="text-xs text-charcoal">Paid</span>
        </label>
      </div>

      <div className="flex items-end gap-2">
        {row.compensation_id && (
          <div className="flex-1">
            <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
              Monthly
            </label>
            <AmountInput
              value={row.default_amount_inr}
              onSave={(n) => onSaveMonthly(String(n))}
            />
          </div>
        )}
        <div className="flex-1">
          <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
            This month
          </label>
          <AmountInput
            value={row.amount_inr}
            onSave={(n) => onSaveThisMonth(String(n))}
          />
        </div>
      </div>

      {row.compensation_id && (
        <button
          onClick={onDeactivate}
          className="text-xs text-terra hover:underline"
        >
          Stop recurring
        </button>
      )}
      {error && <p className="text-xs text-terra">{error}</p>}
    </div>
  );
}

type Person = { id: string; full_name: string; role: string };

function AddPayrollModal({
  month,
  onClose,
  onSaved,
}: {
  month: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"person" | "free">("person");
  const [people, setPeople] = useState<Person[]>([]);
  const [profileId, setProfileId] = useState<string>("");
  const [payeeName, setPayeeName] = useState<string>("");
  const [category, setCategory] = useState<PayrollCategory>("salary");
  const [amount, setAmount] = useState<string>("");
  const [recurring, setRecurring] = useState<boolean>(true);
  const [isPaid, setIsPaid] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ops/payroll/people")
      .then((r) => r.json())
      .then((d) => setPeople(d.data?.people ?? []))
      .catch(() => {});
  }, []);

  async function handleSave() {
    const amountNum = Math.round(Number(amount));
    if (!amountNum || amountNum < 1 || Number.isNaN(amountNum)) {
      setError("Enter an amount of ₹1 or more.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let res: Response;
      if (mode === "person") {
        if (!profileId) {
          setError("Pick a person.");
          setSaving(false);
          return;
        }
        res = await fetch("/api/ops/payroll/compensation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payee_profile_id: profileId,
            category,
            monthly_amount_inr: amountNum,
            effective_from: month,
          }),
        });
      } else {
        if (!payeeName.trim()) {
          setError("Enter a payee name.");
          setSaving(false);
          return;
        }
        if (recurring) {
          res = await fetch("/api/ops/payroll/compensation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payee_name: payeeName.trim(),
              category,
              monthly_amount_inr: amountNum,
              effective_from: month,
            }),
          });
        } else {
          res = await fetch("/api/ops/payroll/one-off", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category,
              expense_month: month,
              amount_inr: amountNum,
              payee_name: payeeName.trim(),
              is_paid: isPaid,
            }),
          });
        }
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  const selectCls =
    "w-full px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 pb-20 md:pb-0 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6 max-h-[85vh] overflow-y-auto mb-16 md:mb-0">
        <h2
          className="text-lg text-charcoal mb-4"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Add salary / expense
        </h2>

        {/* Mode toggle */}
        <div className="inline-flex rounded-xl border border-stone bg-cream p-0.5 mb-4">
          {(
            [
              ["person", "Existing person"],
              ["free", "Free-form"],
            ] as ["person" | "free", string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === key
                  ? "bg-forest text-offwhite"
                  : "text-charcoal hover:bg-offwhite"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === "person" ? (
            <div>
              <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
                Person
              </label>
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className={selectCls}
              >
                <option value="">Select a person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.role})
                  </option>
                ))}
              </select>
              {people.length === 0 && (
                <p className="text-[10px] text-sage mt-1">
                  Everyone active already has a recurring salary. Use Free-form for
                  others.
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
                Payee name
              </label>
              <input
                type="text"
                maxLength={120}
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                className={selectCls}
                placeholder="e.g. Priya — Marketing consultant"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
              Type
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PayrollCategory)}
              className={selectCls}
            >
              {PAYROLL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-sage uppercase tracking-wider mb-1">
              {mode === "free" && !recurring ? "Amount (₹)" : "Monthly amount (₹)"}
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={selectCls}
              placeholder="0"
            />
          </div>

          {mode === "free" && (
            <>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="w-4 h-4 accent-forest"
                />
                <span className="text-sm text-charcoal">
                  Recurring every month
                </span>
              </label>
              {!recurring && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                    className="w-4 h-4 accent-forest"
                  />
                  <span className="text-sm text-charcoal">Already paid</span>
                </label>
              )}
            </>
          )}
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
