"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PinForm({ token }: { token: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ops/auth/gardener-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/ops/gardener/today");
      } else {
        setError(data.error ?? "Something went wrong. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="pin"
          className="block text-sm font-medium text-charcoal mb-2"
          style={{ fontFamily: "var(--font-dm-sans, sans-serif)" }}
        >
          Enter your PIN
        </label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          required
          autoFocus
          placeholder="••••"
          className="w-full px-4 py-4 border border-stone rounded-xl text-2xl tracking-[0.5em] text-center text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest"
          style={{ fontFamily: "var(--font-dm-sans, sans-serif)" }}
        />
      </div>

      {error && (
        <p
          className="text-sm text-terra text-center"
          style={{ fontFamily: "var(--font-dm-sans, sans-serif)" }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || pin.length !== 4}
        className="w-full py-4 bg-forest text-offwhite rounded-xl font-medium text-base hover:bg-garden disabled:opacity-40 transition-colors"
        style={{ fontFamily: "var(--font-dm-sans, sans-serif)" }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
