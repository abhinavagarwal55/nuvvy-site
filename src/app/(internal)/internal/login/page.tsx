"use client";

import { useState, useEffect, useActionState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendOtp, verifyOtp, type ActionResult } from "./actions";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);

  const [sendState, sendAction, sendPending] = useActionState<ActionResult | null, FormData>(sendOtp, null);
  const [verifyState, verifyAction, verifyPending] = useActionState<ActionResult | null, FormData>(verifyOtp, null);

  // Check for error query param from callback redirects
  useEffect(() => {
    const error = searchParams.get("error");
    if (error === "not_authorized") {
      setQueryError("You're signed in, but you don't have access. Contact admin.");
    } else if (error === "auth_failed") {
      setQueryError("Authentication failed. Please try again.");
    } else if (error) {
      setQueryError(`Error: ${decodeURIComponent(error)}`);
    }
  }, [searchParams]);

  // After successful OTP send → go to step 2
  useEffect(() => {
    if (sendState?.ok) {
      setStep("code");
    }
  }, [sendState]);

  // After successful verify → redirect to internal dashboard
  useEffect(() => {
    if (verifyState?.ok) {
      router.push("/internal");
    }
  }, [verifyState, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sign in to Nuvvy Internal</h1>
        <p className="text-sm text-gray-500 mb-6">
          {step === "email"
            ? "Enter your email to receive a 6-digit code."
            : `Code sent to ${email}`}
        </p>

        {queryError && (
          <div className="mb-4 p-3 rounded-md bg-red-50 text-red-800 border border-red-200 text-sm">
            {queryError}
          </div>
        )}

        {step === "email" ? (
          <form action={sendAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@nuvvy.in"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={sendPending}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendPending ? "Sending..." : "Send code"}
            </button>
            {sendState?.error && (
              <p className="text-sm text-red-600 mt-2">{sendState.error}</p>
            )}
          </form>
        ) : (
          <form action={verifyAction} className="space-y-4">
            {/* Carry email through to verify action */}
            <input type="hidden" name="email" value={email} />
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                Login code
              </label>
              <input
                id="token"
                name="token"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                autoFocus
                placeholder="••••••"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg tracking-widest text-center"
              />
            </div>
            <button
              type="submit"
              disabled={verifyPending}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifyPending ? "Verifying..." : "Verify"}
            </button>
            {verifyState?.error && (
              <p className="text-sm text-red-600 mt-2">{verifyState.error}</p>
            )}
            <button
              type="button"
              onClick={() => setStep("email")}
              className="w-full text-sm text-gray-500 hover:text-gray-700 underline mt-2"
            >
              Resend code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
