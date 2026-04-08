"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Gardener = {
  id: string;
  phone: string;
  is_active: boolean;
  join_date: string | null;
  notes: string | null;
  profiles: { full_name: string | null } | null;
};

type Horticulturist = {
  id: string;
  email: string;
  is_active: boolean;
  join_date: string | null;
  notes: string | null;
  profiles: { full_name: string | null } | null;
};

// ─── Gardener Modal ────────────────────────────────────────────────────────────

function GardenerModal({
  gardener,
  onClose,
  onSaved,
}: {
  gardener: Gardener | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!gardener;
  const [fullName, setFullName] = useState(gardener?.profiles?.full_name ?? "");
  const [phone, setPhone] = useState(gardener?.phone ?? "");
  const [pin, setPin] = useState("");
  const [joinDate, setJoinDate] = useState(gardener?.join_date ?? "");
  const [notes, setNotes] = useState(gardener?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        full_name: fullName,
        join_date: joinDate || null,
        notes: notes || null,
      };
      let res: Response;
      if (isEdit) {
        if (pin) body.pin = pin;
        res = await fetch(`/api/internal/team/gardeners/${gardener.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        body.phone = phone;
        body.pin = pin;
        res = await fetch("/api/internal/team/gardeners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {isEdit ? "Edit gardener" : "Add gardener"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name" required>
            <input className={inputCls} value={fullName} onChange={e => setFullName(e.target.value)} required />
          </Field>
          <Field label="Phone number" required>
            <input className={inputCls} type="tel" value={phone} onChange={e => setPhone(e.target.value)} required={!isEdit} disabled={isEdit} placeholder="+91 98765 43210" />
          </Field>
          <Field label={isEdit ? "New PIN (leave blank to keep current)" : "PIN"} required={!isEdit}>
            <input
              className={inputCls}
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value)}
              required={!isEdit}
              placeholder="6 digits"
            />
          </Field>
          <Field label="Join date">
            <input className={inputCls} type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} />
          </Field>
          <Field label="Notes">
            <textarea className={inputCls} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Horticulturist Modal ──────────────────────────────────────────────────────

function HorticulturistModal({
  horti,
  onClose,
  onSaved,
}: {
  horti: Horticulturist | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!horti;
  const [fullName, setFullName] = useState(horti?.profiles?.full_name ?? "");
  const [email, setEmail] = useState(horti?.email ?? "");
  const [joinDate, setJoinDate] = useState(horti?.join_date ?? "");
  const [notes, setNotes] = useState(horti?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = { full_name: fullName, email, join_date: joinDate || null, notes: notes || null };
      let res: Response;
      if (isEdit) {
        res = await fetch(`/api/internal/team/horticulturists/${horti.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/internal/team/horticulturists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {isEdit ? "Edit horticulturist" : "Add horticulturist"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name" required>
            <input className={inputCls} value={fullName} onChange={e => setFullName(e.target.value)} required />
          </Field>
          <Field label="Email address" required>
            <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={isEdit} />
          </Field>
          <Field label="Join date">
            <input className={inputCls} type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} />
          </Field>
          <Field label="Notes">
            <textarea className={inputCls} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Deactivate Confirm ────────────────────────────────────────────────────────

function DeactivateConfirm({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Deactivate {name}?</h2>
        <p className="text-sm text-gray-600 mb-6">They will no longer be able to log in.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [gardeners, setGardeners] = useState<Gardener[]>([]);
  const [hortis, setHortis] = useState<Horticulturist[]>([]);
  const [loadingG, setLoadingG] = useState(true);
  const [loadingH, setLoadingH] = useState(true);

  // Modal state
  const [gardenerModal, setGardenerModal] = useState<Gardener | null | "new">(null);
  const [hortiModal, setHortiModal] = useState<Horticulturist | null | "new">(null);
  const [deactivateTarget, setDeactivateTarget] = useState<{
    type: "gardener" | "horticulturist";
    id: string;
    name: string;
  } | null>(null);

  const loadGardeners = useCallback(async () => {
    setLoadingG(true);
    const res = await fetch("/api/internal/team/gardeners");
    const data = await res.json();
    setGardeners(data.gardeners ?? []);
    setLoadingG(false);
  }, []);

  const loadHortis = useCallback(async () => {
    setLoadingH(true);
    const res = await fetch("/api/internal/team/horticulturists");
    const data = await res.json();
    setHortis(data.horticulturists ?? []);
    setLoadingH(false);
  }, []);

  useEffect(() => {
    loadGardeners();
    loadHortis();
  }, [loadGardeners, loadHortis]);

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    const { type, id } = deactivateTarget;
    await fetch(`/api/internal/team/${type === "gardener" ? "gardeners" : "horticulturists"}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    setDeactivateTarget(null);
    if (type === "gardener") loadGardeners();
    else loadHortis();
  }

  return (
    <div className="max-w-4xl space-y-10">
      <h1 className="text-2xl font-bold text-gray-900">Team</h1>

      {/* ── Horticulturists ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Horticulturists</h2>
          <button
            onClick={() => setHortiModal("new")}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            + Add horticulturist
          </button>
        </div>
        {loadingH ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : hortis.length === 0 ? (
          <p className="text-sm text-gray-500">No horticulturists yet.</p>
        ) : (
          <div className="space-y-2">
            {hortis.map((h) => (
              <div key={h.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{h.profiles?.full_name ?? "—"}</p>
                  <p className="text-sm text-gray-500 truncate">{h.email}</p>
                </div>
                <StatusBadge active={h.is_active} />
                <button
                  onClick={() => setHortiModal(h)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Edit
                </button>
                {h.is_active && (
                  <button
                    onClick={() =>
                      setDeactivateTarget({
                        type: "horticulturist",
                        id: h.id,
                        name: h.profiles?.full_name ?? h.email,
                      })
                    }
                    className="text-sm text-red-500 hover:underline"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Gardeners ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Gardeners</h2>
          <button
            onClick={() => setGardenerModal("new")}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            + Add gardener
          </button>
        </div>
        {loadingG ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : gardeners.length === 0 ? (
          <p className="text-sm text-gray-500">No gardeners yet.</p>
        ) : (
          <div className="space-y-2">
            {gardeners.map((g) => (
              <div key={g.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{g.profiles?.full_name ?? "—"}</p>
                  <p className="text-sm text-gray-500">{g.phone}</p>
                </div>
                <StatusBadge active={g.is_active} />
                <button
                  onClick={() => setGardenerModal(g)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Edit
                </button>
                {g.is_active && (
                  <button
                    onClick={() =>
                      setDeactivateTarget({
                        type: "gardener",
                        id: g.id,
                        name: g.profiles?.full_name ?? g.phone,
                      })
                    }
                    className="text-sm text-red-500 hover:underline"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Modals ── */}
      {gardenerModal !== null && (
        <GardenerModal
          gardener={gardenerModal === "new" ? null : gardenerModal}
          onClose={() => setGardenerModal(null)}
          onSaved={loadGardeners}
        />
      )}
      {hortiModal !== null && (
        <HorticulturistModal
          horti={hortiModal === "new" ? null : hortiModal}
          onClose={() => setHortiModal(null)}
          onSaved={loadHortis}
        />
      )}
      {deactivateTarget && (
        <DeactivateConfirm
          name={deactivateTarget.name}
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}
