"use client";

import { useState, useEffect, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { sendMagicLink, type ActionResult } from "./actions";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(sendMagicLink, null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Check for error query param from callback redirects
  useEffect(() => {
    const error = searchParams.get("error");
    const errorCode = searchParams.get("error_code");
    
    if (error === "not_authorized") {
      setQueryError("You're signed in, but you don't have access. Contact admin.");
    } else if (error === "missing_code" || errorCode === "otp_expired") {
      setQueryError("The magic link has expired or is invalid. Please request a new link.");
    } else if (error === "auth_failed") {
      setQueryError("Authentication failed. Please try again.");
    } else if (error) {
      setQueryError(`Error: ${decodeURIComponent(error)}`);
    } else {
      setQueryError(null);
    }
  }, [searchParams]);

  // Clear email on successful submission
  useEffect(() => {
    if (state?.ok) {
      setEmail("");
    }
  }, [state]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Sign in to Nuvvy Internal</h1>
        
        <form action={formAction} className="space-y-4">
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
              placeholder="you@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Sending..." : "Send magic link"}
          </button>
        </form>

        {/* Display action state messages */}
        {state?.message && (
          <div className="mt-4 p-3 rounded-md bg-green-50 text-green-800 border border-green-200">
            {state.message}
          </div>
        )}
        {state?.error && (
          <div className="mt-4 p-3 rounded-md bg-red-50 text-red-800 border border-red-200">
            {state.error}
          </div>
        )}
        {queryError && (
          <div className="mt-4 p-3 rounded-md bg-red-50 text-red-800 border border-red-200">
            {queryError}
          </div>
        )}

        <p className="mt-4 text-xs text-gray-500 text-center">
          Magic links expire quickly — request a new link if you see "expired".
        </p>
        <p className="mt-2 text-xs text-gray-400 text-center">
          If you see PKCE errors, request a new link and click it in the same browser.
        </p>
      </div>
    </div>
  );
}
