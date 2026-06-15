"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Send,
  Download,
  Loader2,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { NewCustomerBadge } from "@/components/ops/NewCustomerBadge";
import {
  renderPlantInvoiceTemplate,
  DEFAULT_PLANT_INVOICE_TEMPLATE,
} from "@/lib/billing/plant-invoice-template";
import { DEFAULT_NUVVY_UPI_ID } from "@/lib/billing/template";

export type PlantOrderBillingRow = {
  plant_order_id: string;
  order_status: string;
  customer_id: string;
  customer_name: string;
  customer_created_at: string | null;
  phone_number: string | null;
  society_name: string | null;
  address: string | null;
  items_summary: string;
  item_count: number;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: "draft" | "finalized" | "paid" | "cancelled" | null;
  invoice_total: number | null;
  invoice_date: string | null;
  paid_at: string | null;
  whatsapp_sent_at: string | null;
  effective_date: string;
};

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  none: { cls: "bg-stone/20 text-charcoal border-stone", label: "No invoice" },
  draft: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Draft" },
  finalized: { cls: "bg-blue-50 text-blue-700 border-blue-200", label: "Invoice Finalized" },
  paid: { cls: "bg-forest/10 text-forest border-forest/30", label: "Paid" },
  cancelled: { cls: "bg-stone/20 text-sage border-stone", label: "Cancelled" },
};

function statusKey(row: PlantOrderBillingRow): string {
  return row.invoice_status ?? "none";
}

function waLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function buildMessage(row: PlantOrderBillingRow, template: string): string {
  return renderPlantInvoiceTemplate(template, {
    customer_name: row.customer_name,
    invoice_number: row.invoice_number ?? "",
    invoice_date: row.invoice_date ? formatDate(row.invoice_date) : "",
    total: row.invoice_total ?? "",
    upi_id: DEFAULT_NUVVY_UPI_ID,
  });
}

export default function PlantOrderBillingList({
  rows,
  template,
  loading,
  monthLabel,
  onChanged,
}: {
  rows: PlantOrderBillingRow[];
  template: string;
  loading: boolean;
  monthLabel: string;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const tmpl = template || DEFAULT_PLANT_INVOICE_TEMPLATE;

  function setErr(id: string, msg: string | null) {
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
      }, 5000);
    }
  }

  async function handleEditInvoice(row: PlantOrderBillingRow) {
    if (row.invoice_id) {
      router.push(`/ops/invoices/${row.invoice_id}`);
      return;
    }
    setBusy((b) => ({ ...b, [row.plant_order_id]: "edit" }));
    try {
      const res = await fetch("/api/ops/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plant_order_id: row.plant_order_id }),
      });
      const json = await res.json();
      if (res.ok && json.data?.id) {
        router.push(`/ops/invoices/${json.data.id}`);
        return;
      }
      // Duplicate — an invoice already exists; route to it.
      if (res.status === 409 && json.existing_invoice_id) {
        router.push(`/ops/invoices/${json.existing_invoice_id}`);
        return;
      }
      setErr(row.plant_order_id, typeof json.error === "string" ? json.error : "Failed to create invoice");
    } catch {
      setErr(row.plant_order_id, "Network error");
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[row.plant_order_id];
        return n;
      });
    }
  }

  async function handlePaidToggle(row: PlantOrderBillingRow, checked: boolean) {
    if (!row.invoice_id) return;
    setBusy((b) => ({ ...b, [row.plant_order_id]: "paid" }));
    try {
      const url = checked
        ? `/api/ops/invoices/${row.invoice_id}/mark-paid`
        : `/api/ops/invoices/${row.invoice_id}/revert`;
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErr(row.plant_order_id, typeof json.error === "string" ? json.error : "Failed to update");
      } else {
        onChanged();
      }
    } catch {
      setErr(row.plant_order_id, "Network error");
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[row.plant_order_id];
        return n;
      });
    }
  }

  // Fetch + download the PDF to the device. Returns true on success.
  async function fetchPdf(row: PlantOrderBillingRow): Promise<boolean> {
    const pdfRes = await fetch(`/api/ops/invoices/${row.invoice_id}/generate-pdf`, {
      method: "POST",
    });
    if (pdfRes.ok && pdfRes.headers.get("content-type")?.includes("application/pdf")) {
      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${row.invoice_number ?? "invoice"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    }
    const json = await pdfRes.json().catch(() => ({}));
    setErr(row.plant_order_id, typeof json.error === "string" ? json.error : "Failed to generate PDF");
    return false;
  }

  async function handleDownloadPdf(row: PlantOrderBillingRow) {
    if (!row.invoice_id) return;
    setBusy((b) => ({ ...b, [row.plant_order_id]: "pdf" }));
    try {
      await fetchPdf(row);
    } catch {
      setErr(row.plant_order_id, "Network error");
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[row.plant_order_id];
        return n;
      });
    }
  }

  async function handleSendWa(row: PlantOrderBillingRow) {
    if (!row.invoice_id || !row.phone_number) return;
    setBusy((b) => ({ ...b, [row.plant_order_id]: "wa" }));
    try {
      // 1. Download the PDF to the device.
      const ok = await fetchPdf(row);
      if (!ok) return;

      // 2. Open WhatsApp with the text message.
      window.open(waLink(row.phone_number, buildMessage(row, tmpl)), "_blank", "noopener,noreferrer");

      // 3. Record the send.
      await fetch(`/api/ops/invoices/${row.invoice_id}/whatsapp-sent`, { method: "POST" });
      onChanged();
    } catch {
      setErr(row.plant_order_id, "Network error");
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[row.plant_order_id];
        return n;
      });
    }
  }

  if (loading) {
    return <p className="text-sm text-sage text-center py-10">Loading…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-stone text-center py-10">
        No billable plant orders in {monthLabel}.
      </p>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <MobileCard
            key={row.plant_order_id}
            row={row}
            tmpl={tmpl}
            busy={busy[row.plant_order_id]}
            error={rowError[row.plant_order_id]}
            expanded={!!expanded[row.plant_order_id]}
            onToggle={() =>
              setExpanded((p) => ({ ...p, [row.plant_order_id]: !p[row.plant_order_id] }))
            }
            onEdit={() => handleEditInvoice(row)}
            onPaid={(c) => handlePaidToggle(row, c)}
            onSendWa={() => handleSendWa(row)}
            onDownload={() => handleDownloadPdf(row)}
          />
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-offwhite border border-stone/60 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream text-xs text-sage uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Customer</th>
              <th className="text-left px-3 py-2 font-medium">Order</th>
              <th className="text-right px-3 py-2 font-medium">Invoice ₹</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Invoice</th>
              <th className="text-left px-3 py-2 font-medium">Preview</th>
              <th className="text-left px-3 py-2 font-medium">WhatsApp</th>
              <th className="text-left px-3 py-2 font-medium">Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <DesktopRow
                key={row.plant_order_id}
                row={row}
                tmpl={tmpl}
                busy={busy[row.plant_order_id]}
                error={rowError[row.plant_order_id]}
                expanded={!!expanded[row.plant_order_id]}
                onToggle={() =>
                  setExpanded((p) => ({ ...p, [row.plant_order_id]: !p[row.plant_order_id] }))
                }
                onEdit={() => handleEditInvoice(row)}
                onPaid={(c) => handlePaidToggle(row, c)}
                onSendWa={() => handleSendWa(row)}
                onDownload={() => handleDownloadPdf(row)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatusBadge({ row }: { row: PlantOrderBillingRow }) {
  const b = STATUS_BADGE[statusKey(row)] ?? STATUS_BADGE.none;
  return (
    <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium border ${b.cls}`}>
      {b.label}
    </span>
  );
}

function EditInvoiceButton({
  row,
  busy,
  onEdit,
}: {
  row: PlantOrderBillingRow;
  busy?: string;
  onEdit: () => void;
}) {
  return (
    <button
      onClick={onEdit}
      disabled={busy === "edit"}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border border-forest text-forest hover:bg-forest/5 disabled:opacity-50"
    >
      {busy === "edit" ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
      {row.invoice_id ? "Edit invoice" : "Create invoice"}
    </button>
  );
}

function WhatsAppButton({
  row,
  busy,
  onSendWa,
}: {
  row: PlantOrderBillingRow;
  busy?: string;
  onSendWa: () => void;
}) {
  const canSend =
    !!row.phone_number &&
    (row.invoice_status === "finalized" || row.invoice_status === "paid");
  const title = !row.phone_number
    ? "No phone on file."
    : !canSend
    ? "Finalize the invoice first."
    : undefined;
  return (
    <button
      onClick={onSendWa}
      disabled={!canSend || busy === "wa"}
      title={title}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border ${
        canSend
          ? "bg-forest text-offwhite border-forest hover:bg-garden"
          : "border-stone text-stone cursor-not-allowed"
      }`}
    >
      {busy === "wa" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
      WhatsApp
    </button>
  );
}

function DownloadPdfButton({
  row,
  busy,
  onDownload,
}: {
  row: PlantOrderBillingRow;
  busy?: string;
  onDownload: () => void;
}) {
  const canDownload =
    row.invoice_status === "finalized" || row.invoice_status === "paid";
  return (
    <button
      onClick={onDownload}
      disabled={!canDownload || busy === "pdf"}
      title={canDownload ? undefined : "Finalize the invoice first."}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border ${
        canDownload
          ? "border-forest text-forest hover:bg-forest/5"
          : "border-stone text-stone cursor-not-allowed"
      }`}
    >
      {busy === "pdf" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      PDF
    </button>
  );
}

function PaidCheckbox({
  row,
  busy,
  onPaid,
}: {
  row: PlantOrderBillingRow;
  busy?: string;
  onPaid: (checked: boolean) => void;
}) {
  const enabled =
    row.invoice_status === "finalized" || row.invoice_status === "paid";
  return (
    <label className={`inline-flex items-center gap-2 ${enabled ? "" : "opacity-50"}`}>
      <input
        type="checkbox"
        checked={row.invoice_status === "paid"}
        disabled={!enabled || busy === "paid"}
        onChange={(e) => onPaid(e.target.checked)}
        className="w-4 h-4 accent-forest"
        title={enabled ? undefined : "Finalize the invoice first."}
      />
      <span className="text-xs text-charcoal">Paid</span>
    </label>
  );
}

function PreviewBox({ row, tmpl }: { row: PlantOrderBillingRow; tmpl: string }) {
  if (!row.invoice_id) {
    return (
      <p className="text-xs text-sage bg-cream/60 border border-stone/40 rounded-xl p-3">
        Create the invoice first to preview the WhatsApp message.
      </p>
    );
  }
  return (
    <pre className="whitespace-pre-wrap text-xs text-charcoal bg-cream/60 border border-stone/40 rounded-xl p-3 font-sans">
      {buildMessage(row, tmpl)}
    </pre>
  );
}

function DesktopRow({
  row,
  tmpl,
  busy,
  error,
  expanded,
  onToggle,
  onEdit,
  onPaid,
  onSendWa,
  onDownload,
}: {
  row: PlantOrderBillingRow;
  tmpl: string;
  busy?: string;
  error?: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onPaid: (checked: boolean) => void;
  onSendWa: () => void;
  onDownload: () => void;
}) {
  return (
    <>
      <tr className="border-t border-stone/40 align-top">
        <td className="px-3 py-3 text-charcoal font-medium">
          <span className="inline-flex items-center gap-2">
            {row.customer_name}
            <NewCustomerBadge createdAt={row.customer_created_at} />
          </span>
          {row.society_name && <p className="text-xs text-sage">{row.society_name}</p>}
        </td>
        <td className="px-3 py-3 text-charcoal max-w-[240px]">
          <span className="text-sm">{row.items_summary}</span>
          <p className="text-[10px] text-sage">{row.item_count} item(s)</p>
        </td>
        <td className="px-3 py-3 text-right text-charcoal tabular-nums">
          {row.invoice_total != null ? `₹${row.invoice_total.toLocaleString("en-IN")}` : "—"}
        </td>
        <td className="px-3 py-3">
          <StatusBadge row={row} />
        </td>
        <td className="px-3 py-3">
          <EditInvoiceButton row={row} busy={busy} onEdit={onEdit} />
        </td>
        <td className="px-3 py-3">
          <button onClick={onToggle} className="inline-flex items-center gap-1 text-xs text-charcoal hover:text-forest">
            Preview {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-col items-start gap-1.5">
            <WhatsAppButton row={row} busy={busy} onSendWa={onSendWa} />
            <DownloadPdfButton row={row} busy={busy} onDownload={onDownload} />
          </div>
          {row.whatsapp_sent_at && (
            <p className="text-[10px] text-sage mt-1">Sent {formatDate(row.whatsapp_sent_at.slice(0, 10))}</p>
          )}
        </td>
        <td className="px-3 py-3">
          <PaidCheckbox row={row} busy={busy} onPaid={onPaid} />
          {row.paid_at && <p className="text-[10px] text-sage mt-1">{formatDate(row.paid_at.slice(0, 10))}</p>}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-cream/50">
          <td colSpan={8} className="px-3 py-3">
            <PreviewBox row={row} tmpl={tmpl} />
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

function MobileCard({
  row,
  tmpl,
  busy,
  error,
  expanded,
  onToggle,
  onEdit,
  onPaid,
  onSendWa,
  onDownload,
}: {
  row: PlantOrderBillingRow;
  tmpl: string;
  busy?: string;
  error?: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onPaid: (checked: boolean) => void;
  onSendWa: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-charcoal text-sm">{row.customer_name}</p>
            <NewCustomerBadge createdAt={row.customer_created_at} />
          </div>
          {row.society_name && <p className="text-xs text-sage">{row.society_name}</p>}
          <p className="text-xs text-sage mt-0.5">{row.items_summary} · {row.item_count} item(s)</p>
        </div>
        <StatusBadge row={row} />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-charcoal tabular-nums">
          {row.invoice_total != null ? `₹${row.invoice_total.toLocaleString("en-IN")}` : "—"}
        </span>
        <PaidCheckbox row={row} busy={busy} onPaid={onPaid} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EditInvoiceButton row={row} busy={busy} onEdit={onEdit} />
        <WhatsAppButton row={row} busy={busy} onSendWa={onSendWa} />
        <DownloadPdfButton row={row} busy={busy} onDownload={onDownload} />
        <button onClick={onToggle} className="inline-flex items-center gap-1 text-xs text-charcoal hover:text-forest ml-auto">
          Preview {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {expanded && <PreviewBox row={row} tmpl={tmpl} />}

      {row.whatsapp_sent_at && (
        <p className="text-[10px] text-sage">Last sent {formatDate(row.whatsapp_sent_at.slice(0, 10))}</p>
      )}
      {error && <p className="text-xs text-terra">{error}</p>}
    </div>
  );
}
