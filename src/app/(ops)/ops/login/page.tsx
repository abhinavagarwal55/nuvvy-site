"use client";

import { useState, useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { sendOtp, verifyOtp, type ActionResult } from "@/lib/auth/otp-actions";

export default function OpsLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");

  const [sendState, sendAction, sendPending] = useActionState<ActionResult | null, FormData>(sendOtp, null);
  const [verifyState, verifyAction, verifyPending] = useActionState<ActionResult | null, FormData>(verifyOtp, null);

  useEffect(() => {
    if (sendState?.ok) setStep("code");
  }, [sendState]);

  useEffect(() => {
    if (verifyState?.ok) router.push("/ops/home");
  }, [verifyState, router]);

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <h1
          className="text-3xl text-center mb-8 text-charcoal"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Nuvvy
        </h1>

        <div className="bg-offwhite rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-medium text-charcoal mb-1">Sign in</h2>
          <p className="text-sm text-sage mb-6">
            {step === "email"
              ? "Enter your email to receive a 6-digit code."
              : `Code sent to ${email}`}
          </p>

          {step === "email" ? (
            <form action={sendAction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">
                  Email address
                </label>
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@nuvvy.in"
                  className="w-full px-3 py-3 border border-stone rounded-xl text-sm focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                />
              </div>
              {sendState?.error && (
                <p className="text-sm text-terra">{sendState.error}</p>
              )}
              <button
                type="submit"
                disabled={sendPending}
                className="w-full py-3 bg-forest text-offwhite rounded-xl font-medium text-sm hover:bg-garden disabled:opacity-50 transition-colors"
              >
                {sendPending ? "Sending…" : "Send code"}
              </button>
            </form>
          ) : (
            <form action={verifyAction} className="space-y-4">
              <input type="hidden" name="email" value={email} />
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">
                  Login code
                </label>
                <input
                  name="token"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="••••••"
                  className="w-full px-3 py-3 border border-stone rounded-xl text-lg tracking-widest text-center focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                />
              </div>
              {verifyState?.error && (
                <p className="text-sm text-terra">{verifyState.error}</p>
              )}
              <button
                type="submit"
                disabled={verifyPending}
                className="w-full py-3 bg-forest text-offwhite rounded-xl font-medium text-sm hover:bg-garden disabled:opacity-50 transition-colors"
              >
                {verifyPending ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                onClick={() => setStep("email")}
                className="w-full text-sm text-sage hover:text-charcoal underline"
              >
                Resend code
              </button>
            </form>
          )}
        </div>

        <p className="text-center mt-4 text-xs text-sage">
          Gardener? Use the login link sent by your team.
        </p>
      </div>
    </div>
  );
}
