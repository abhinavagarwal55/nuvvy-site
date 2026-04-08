"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check, Link2, KeyRound, UserX, UserCheck, Plus, Pencil } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Person = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  role: "admin" | "horticulturist" | "gardener";
  status: "active" | "inactive";
  created_at: string;
  login_token: string | null;
};

// ─── Small utilities ───────────────────────────────────────────────────────────

const ROLE_LABEL: Record<Person["role"], string> = {
  admin: "Admin",
  horticulturist: "Horticulturist",
  gardener: "Gardener",
};

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

function StatusBadge({ status }: { status: Person["status"] }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        status === "active"
          ? "bg-[#EAF2EC] text-forest"
          : "bg-stone/30 text-sage"
      }`}
    >
      {status === "active" ? "Active" : "Inactive"}
    </span>
  );
}

function RoleBadge({ role }: { role: Person["role"] }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-cream border border-stone text-charcoal font-medium">
      {ROLE_LABEL[role]}
    </span>
  );
}

// ─── Copy login link button ────────────────────────────────────────────────────

function CopyLoginLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/ops/g/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-forest hover:text-garden font-medium"
      title="Copy login link"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

// ─── Set PIN modal ─────────────────────────────────────────────────────────────

function SetPinModal({
  person,
  onClose,
  onSaved,
}: {
  person: Person;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/ops/people/${person.id}/set-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to set PIN"); return; }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6">
        <h2 className="font-semibold text-charcoal mb-1">Set PIN</h2>
        <p className="text-sm text-sage mb-4">{person.full_name}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">4-digit PIN</label>
            <input
              className={inputCls}
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              autoFocus
              required
            />
          </div>
          {error && <p className="text-sm text-terra">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream">Cancel</button>
            <button type="submit" disabled={saving || pin.length !== 4} className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm hover:bg-garden disabled:opacity-40">
              {saving ? "Saving…" : "Set PIN"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Create person modal ───────────────────────────────────────────────────────

function CreatePersonModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<"gardener" | "horticulturist">("gardener");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body =
        role === "gardener"
          ? { role, full_name: fullName, phone: phone || undefined, pin }
          : { role, full_name: fullName, phone: phone || undefined, email };

      const res = await fetch("/api/ops/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create"); return; }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6 max-h-[80vh] overflow-y-auto">
        <h2 className="font-semibold text-charcoal mb-4">Add person</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role selector */}
          <div className="flex gap-2">
            {(["gardener", "horticulturist"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  role === r
                    ? "bg-forest text-offwhite border-forest"
                    : "bg-cream text-charcoal border-stone hover:border-forest"
                }`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Full name <span className="text-terra">*</span></label>
            <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Ravi Kumar" />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Phone</label>
            <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>

          {role === "horticulturist" && (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Email <span className="text-terra">*</span></label>
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="priya@nuvvy.in" />
            </div>
          )}

          {role === "gardener" && (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">4-digit PIN <span className="text-terra">*</span></label>
              <input
                className={inputCls}
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                required
                placeholder="••••"
              />
              <p className="text-xs text-sage mt-1">You'll send the login link via WhatsApp after creating.</p>
            </div>
          )}

          {error && <p className="text-sm text-terra">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm hover:bg-garden disabled:opacity-40">
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Deactivate confirm ────────────────────────────────────────────────────────

function StatusConfirm({
  person,
  onConfirm,
  onCancel,
}: {
  person: Person;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDeactivating = person.status === "active";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-semibold text-charcoal mb-2">
          {isDeactivating ? "Deactivate" : "Reactivate"} {person.full_name}?
        </h2>
        <p className="text-sm text-sage mb-6">
          {isDeactivating
            ? "They will no longer be able to log in."
            : "They will be able to log in again."}
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream">Cancel</button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm text-offwhite ${isDeactivating ? "bg-terra hover:opacity-90" : "bg-forest hover:bg-garden"}`}
          >
            {isDeactivating ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Person row ────────────────────────────────────────────────────────────────

function PersonRow({
  person,
  isAdmin,
  onSetPin,
  onToggleStatus,
  onEdit,
}: {
  person: Person;
  isAdmin: boolean;
  onSetPin: (p: Person) => void;
  onToggleStatus: (p: Person) => void;
  onEdit: (p: Person) => void;
}) {
  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-charcoal truncate">{person.full_name ?? person.email ?? "—"}</p>
          {person.email && <p className="text-xs text-sage">{person.email}</p>}
          {person.phone && <p className="text-xs text-sage">{person.phone}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <RoleBadge role={person.role} />
          <StatusBadge status={person.status} />
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-4 pt-1 border-t border-stone/40">
        {isAdmin && (
          <button
            onClick={() => onEdit(person)}
            className="flex items-center gap-1.5 text-xs text-forest hover:text-garden font-medium"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
        {person.role === "gardener" && person.login_token && (
          <CopyLoginLink token={person.login_token} />
        )}
        {person.role === "gardener" && person.login_token && (
          <button
            onClick={() => onSetPin(person)}
            className="flex items-center gap-1.5 text-xs text-charcoal hover:text-forest font-medium"
          >
            <KeyRound size={14} />
            Set PIN
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => onToggleStatus(person)}
            className={`flex items-center gap-1.5 text-xs font-medium ml-auto ${
              person.status === "active"
                ? "text-terra hover:opacity-80"
                : "text-forest hover:opacity-80"
            }`}
          >
            {person.status === "active" ? (
              <><UserX size={14} /> Deactivate</>
            ) : (
              <><UserCheck size={14} /> Reactivate</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [isAdmin, setIsAdmin] = useState(false);

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [setPinTarget, setSetPinTarget] = useState<Person | null>(null);
  const [statusTarget, setStatusTarget] = useState<Person | null>(null);
  const [editTarget, setEditTarget] = useState<Person | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = roleFilter !== "all" ? `?role=${roleFilter}` : "";
    const res = await fetch(`/api/ops/people${params}`);
    const json = await res.json();
    setPeople(json.data ?? []);

    // Determine if current user is admin from the response (they'll appear in the list)
    // Simpler: check via a dedicated endpoint — for now derive from cookie/profile
    // We use a heuristic: if the user can see the page and we show admin-only actions
    // based on a separate auth check. For now fetch from /api/ops/people?role=admin
    // and check if viewer is in it — too complex. Instead we do a role-check call.
    setLoading(false);
  }, [roleFilter]);

  // Check own role
  useEffect(() => {
    fetch("/api/ops/people/me/role")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.data?.role === "admin"))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggleStatus(person: Person) {
    const newStatus = person.status === "active" ? "inactive" : "active";
    await fetch(`/api/ops/people/${person.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setStatusTarget(null);
    load();
  }

  const filtered = roleFilter === "all"
    ? people
    : people.filter((p) => p.role === roleFilter);

  const gardeners = filtered.filter((p) => p.role === "gardener");
  const horticulturists = filtered.filter((p) => p.role === "horticulturist");
  const admins = filtered.filter((p) => p.role === "admin");

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1
            className="text-2xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            People
          </h1>
          {isAdmin && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
            >
              <Plus size={16} />
              Add
            </button>
          )}
        </div>

        {/* Role filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["all", "gardener", "horticulturist", "admin"].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                roleFilter === r
                  ? "bg-forest text-offwhite border-forest"
                  : "bg-cream text-charcoal border-stone"
              }`}
            >
              {r === "all" ? "All" : ROLE_LABEL[r as Person["role"]]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-6">
        {loading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : (
          <>
            {(roleFilter === "all" || roleFilter === "gardener") && (
              <Section title="Gardeners" count={gardeners.length}>
                {gardeners.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    isAdmin={isAdmin}
                    onSetPin={setSetPinTarget}
                    onToggleStatus={setStatusTarget}
                    onEdit={setEditTarget}
                  />
                ))}
              </Section>
            )}
            {(roleFilter === "all" || roleFilter === "horticulturist") && (
              <Section title="Horticulturists" count={horticulturists.length}>
                {horticulturists.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    isAdmin={isAdmin}
                    onSetPin={setSetPinTarget}
                    onToggleStatus={setStatusTarget}
                    onEdit={setEditTarget}
                  />
                ))}
              </Section>
            )}
            {(roleFilter === "all" || roleFilter === "admin") && (
              <Section title="Admins" count={admins.length}>
                {admins.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    isAdmin={isAdmin}
                    onSetPin={setSetPinTarget}
                    onToggleStatus={setStatusTarget}
                    onEdit={setEditTarget}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {createOpen && (
        <CreatePersonModal onClose={() => setCreateOpen(false)} onSaved={load} />
      )}
      {setPinTarget && (
        <SetPinModal
          person={setPinTarget}
          onClose={() => setSetPinTarget(null)}
          onSaved={load}
        />
      )}
      {statusTarget && (
        <StatusConfirm
          person={statusTarget}
          onConfirm={() => handleToggleStatus(statusTarget)}
          onCancel={() => setStatusTarget(null)}
        />
      )}
      {editTarget && (
        <EditPersonModal
          person={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ─── Edit person modal ────────────────────────────────────────────────────────

function EditPersonModal({
  person,
  onClose,
  onSaved,
}: {
  person: Person;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(person.full_name ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const [email, setEmail] = useState(person.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const showEmail = person.role !== "gardener";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/ops/people/${person.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName || undefined,
          phone: phone || null,
          email: showEmail && email !== person.email ? email : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6">
        <h2 className="font-semibold text-charcoal mb-1">Edit person</h2>
        <p className="text-sm text-sage mb-4">
          {person.email ?? person.full_name ?? "—"} · {ROLE_LABEL[person.role]}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              Full name
            </label>
            <input
              className={inputCls}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              autoFocus
            />
          </div>
          {showEmail && (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Email
              </label>
              <input
                className={inputCls}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@nuvvy.in"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              Phone
            </label>
            <input
              className={inputCls}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>
          {error && <p className="text-sm text-terra">{error}</p>}
          <div className="flex gap-3">
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
              className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm hover:bg-garden disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
        {title} <span className="normal-case">({count})</span>
      </p>
      <div className="space-y-2">
        {count === 0 ? (
          <p className="text-sm text-stone text-center py-4">None yet.</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
