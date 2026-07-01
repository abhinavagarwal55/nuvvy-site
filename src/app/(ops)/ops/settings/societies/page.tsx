"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2, X, Loader2, AlertTriangle } from "lucide-react";

type Society = {
  id: string;
  name: string;
  short_name: string | null;
  address: string | null;
  total_units: number | null;
  contact_info: string | null;
  customer_count: number;
};

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

function isIncomplete(s: Society): boolean {
  return !s.address?.trim() || !s.contact_info?.trim();
}

/* ---------- Slide-up modal ---------- */
function SlideUpModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-offwhite rounded-t-2xl p-5 pb-8 mb-16 max-h-[85vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-offwhite pb-2">
          <h2
            className="text-lg text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            {title}
          </h2>
          <button onClick={onClose} className="p-1 text-sage hover:text-charcoal">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function SocietiesSettingsPage() {
  const [societies, setSocieties] = useState<Society[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Society | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Society | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/societies");
      const json = await res.json().catch(() => ({}));
      setSocieties(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(s: Society) {
    setEditing(s);
    setFormOpen(true);
  }

  return (
    <div className="min-h-screen bg-cream pb-24 md:pl-56">
      <div className="bg-offwhite border-b border-stone px-4 md:px-8 pt-6 pb-4 sticky top-0 z-10">
        <Link
          href="/ops/settings"
          className="inline-flex items-center gap-1 text-xs text-sage hover:text-forest mb-2"
        >
          <ArrowLeft size={14} /> Settings
        </Link>
        <div className="flex items-center justify-between">
          <h1
            className="text-2xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Societies
          </h1>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
          >
            <Plus size={16} /> New society
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6 max-w-[960px]">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sage">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading…
          </div>
        ) : societies.length === 0 ? (
          <p className="text-sm text-stone text-center py-10">No societies yet.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-offwhite rounded-2xl border border-stone/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone bg-cream/50 text-left text-sage">
                    <th className="py-2.5 px-4 font-medium">Name</th>
                    <th className="py-2.5 px-3 font-medium">Short</th>
                    <th className="py-2.5 px-3 font-medium">Address</th>
                    <th className="py-2.5 px-3 font-medium">Units</th>
                    <th className="py-2.5 px-3 font-medium">Contact</th>
                    <th className="py-2.5 px-3 font-medium">In use</th>
                    <th className="py-2.5 px-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {societies.map((s) => (
                    <tr key={s.id} className="border-b border-stone/30 last:border-0">
                      <td className="py-3 px-4 text-charcoal font-medium">
                        <span className="flex items-center gap-2">
                          {s.name}
                          {isIncomplete(s) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-terra/10 text-terra">
                              Incomplete
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-sage">{s.short_name ?? "—"}</td>
                      <td className="py-3 px-3 text-sage max-w-[220px] truncate">{s.address ?? "—"}</td>
                      <td className="py-3 px-3 text-sage">{s.total_units ?? "—"}</td>
                      <td className="py-3 px-3 text-sage max-w-[180px] truncate">{s.contact_info ?? "—"}</td>
                      <td className="py-3 px-3 text-charcoal">{s.customer_count}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(s)}
                            className="p-1.5 text-sage hover:text-forest"
                            aria-label="Edit"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(s)}
                            className="p-1.5 text-sage hover:text-terra"
                            aria-label="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {societies.map((s) => (
                <div key={s.id} className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-charcoal text-sm flex items-center gap-2">
                        {s.name}
                        {isIncomplete(s) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-terra/10 text-terra">
                            Incomplete
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-sage mt-0.5">
                        {s.short_name ? `${s.short_name} · ` : ""}
                        {s.customer_count} in use
                      </p>
                      {s.address && <p className="text-xs text-sage mt-0.5 truncate">{s.address}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-sage hover:text-forest">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setDeleteTarget(s)} className="p-1.5 text-sage hover:text-terra">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <SlideUpModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit Society" : "New Society"}
      >
        <SocietyForm
          key={editing?.id ?? "new"}
          society={editing}
          onDone={() => {
            setFormOpen(false);
            load();
          }}
        />
      </SlideUpModal>

      {deleteTarget && (
        <DeleteSocietyModal
          society={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ---------- Create / Edit form ---------- */
function SocietyForm({ society, onDone }: { society: Society | null; onDone: () => void }) {
  const [name, setName] = useState(society?.name ?? "");
  const [shortName, setShortName] = useState(society?.short_name ?? "");
  const [address, setAddress] = useState(society?.address ?? "");
  const [totalUnits, setTotalUnits] = useState(society?.total_units != null ? String(society.total_units) : "");
  const [contactInfo, setContactInfo] = useState(society?.contact_info ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const unitsParsed = totalUnits.trim() === "" ? null : Number(totalUnits);
      if (unitsParsed !== null && !Number.isFinite(unitsParsed)) {
        setError("Total units must be a number");
        setSaving(false);
        return;
      }

      let res: Response;
      if (society) {
        res = await fetch(`/api/ops/societies/${society.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            short_name: shortName.trim() || null,
            address: address.trim() || null,
            total_units: unitsParsed !== null ? Math.trunc(unitsParsed) : null,
            contact_info: contactInfo.trim() || null,
          }),
        });
      } else {
        res = await fetch("/api/ops/societies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            short_name: shortName.trim() || undefined,
            address: address.trim() || undefined,
            total_units: unitsParsed !== null ? Math.trunc(unitsParsed) : undefined,
            contact_info: contactInfo.trim() || undefined,
          }),
        });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Failed to save society");
        return;
      }
      onDone();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-sage mb-1">Name *</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Windmills of Your Mind" />
      </div>
      <div>
        <label className="block text-xs text-sage mb-1">
          Short name <span className="text-stone">(shown on schedule pills)</span>
        </label>
        <input className={inputCls} value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="e.g. WoYM" />
      </div>
      <div>
        <label className="block text-xs text-sage mb-1">Address</label>
        <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Location of the society" />
      </div>
      <div>
        <label className="block text-xs text-sage mb-1">Total units</label>
        <input className={inputCls} type="number" min={0} value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} placeholder="e.g. 240" />
      </div>
      <div>
        <label className="block text-xs text-sage mb-1">Contact info</label>
        <input className={inputCls} value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="Facility manager, gate number, etc." />
      </div>

      {error && <p className="text-xs text-terra bg-terra/10 rounded-lg px-3 py-2">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="w-full py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mt-1"
      >
        {saving && <Loader2 size={16} className="animate-spin" />}
        {saving ? "Saving…" : society ? "Save Changes" : "Create Society"}
      </button>
    </div>
  );
}

/* ---------- Guarded delete ---------- */
function DeleteSocietyModal({
  society,
  onClose,
  onDeleted,
}: {
  society: Society;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [blocked, setBlocked] = useState<{ customer_count: number; lead_count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/societies/${society.id}`, { method: "DELETE" });
      if (res.status === 409) {
        const json = await res.json().catch(() => ({}));
        setBlocked({ customer_count: json.customer_count ?? 0, lead_count: json.lead_count ?? 0 });
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(typeof json.error === "string" ? json.error : "Failed to delete");
        return;
      }
      onDeleted();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="bg-terra/10 p-2 rounded-xl">
            <AlertTriangle size={18} className="text-terra" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-charcoal">Delete society</h2>
            <p className="text-sm text-sage mt-0.5">{society.name}</p>
          </div>
        </div>

        {blocked ? (
          <div className="bg-terra/10 text-charcoal text-sm rounded-xl px-3 py-2.5 mb-4">
            This society can&apos;t be deleted because it&apos;s in use by{" "}
            {blocked.customer_count > 0 && (
              <span className="font-medium">
                {blocked.customer_count} customer{blocked.customer_count === 1 ? "" : "s"}
              </span>
            )}
            {blocked.customer_count > 0 && blocked.lead_count > 0 && " and "}
            {blocked.lead_count > 0 && (
              <span className="font-medium">
                {blocked.lead_count} lead{blocked.lead_count === 1 ? "" : "s"}
              </span>
            )}
            . Reassign or remove those first.
          </div>
        ) : (
          <p className="text-sm text-charcoal mb-4">
            This permanently deletes the society. It&apos;s only allowed when no customer or lead
            references it.
          </p>
        )}

        {error && <p className="text-xs text-terra bg-terra/10 rounded-lg px-3 py-2 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream"
          >
            {blocked ? "Close" : "Cancel"}
          </button>
          {!blocked && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2.5 bg-terra text-offwhite rounded-xl text-sm font-medium hover:bg-terra/80 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {deleting && <Loader2 size={14} className="animate-spin" />}
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
