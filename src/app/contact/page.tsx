"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [serviceType, setServiceType] = useState<"design" | "maintenance" | "">("");

  // Prefill serviceType from ?service=design|maintenance
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("service");
    if (s === "design" || s === "maintenance") setServiceType(s);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    const fd = new FormData(e.currentTarget);

    // Honeypot guard (ignore real users)
    if ((fd.get("website") as string)?.trim()) {
      setIsSubmitting(false);
      return;
    }

    // Build payload exactly for your Sheet mapping
    const payload = {
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      phone: String(fd.get("phone") || ""),
      serviceType: String(fd.get("serviceType") || ""),
      locality: String(fd.get("locality") || ""),
      message: String(fd.get("message") || ""),
      source: "Website",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      // ip + timestamp are handled by n8n
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors(data?.errors || { general: "Something went wrong." });
      } else {
        setIsSuccess(true);
      }
    } catch {
      setErrors({ general: "Network error. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <main className="bg-cream">
        <section className="pt-20 pb-0">
          <div className="container mx-auto px-6">
            <div className="max-w-2xl mx-auto text-center rounded-2xl bg-white p-10 shadow">
              <div className="text-5xl mb-4">✅</div>
              <h1 className="text-3xl font-semibold text-green-dark mb-3">
                Thanks! We’ve received your request.
              </h1>
              <p className="text-gray-600">We&apos;ll get back within 1 business day.</p>
              <Link href="/" className="inline-block mt-8 bg-green text-white px-6 py-3 rounded-xl">
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="bg-cream">
      <section className="pt-12 pb-0">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto bg-white rounded-2xl p-8 shadow border border-gray-200">
            <h1 className="text-2xl font-semibold text-green-dark mb-6">Contact Nuvvy</h1>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Honeypot */}
              <input type="text" name="website" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

              {/* Service Type (required) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What service do you need? <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="serviceType"
                      value="design"
                      required
                      checked={serviceType === "design"}
                      onChange={() => setServiceType("design")}
                    />
                    <span>Garden Design</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="serviceType"
                      value="maintenance"
                      required
                      checked={serviceType === "maintenance"}
                      onChange={() => setServiceType("maintenance")}
                    />
                    <span>Maintenance</span>
                  </label>
                </div>
              </div>

              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-green focus:border-transparent"
                  placeholder="Your full name"
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  required
                  inputMode="tel"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-green focus:border-transparent"
                  placeholder="+91 9XXXXXXXXX"
                />
                <p className="text-xs text-gray-500 mt-1">Include country code (+91 for India)</p>
              </div>

              {/* Email (optional) */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email (optional)
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-green focus:border-transparent"
                  placeholder="your.email@example.com"
                />
              </div>

              {/* Locality */}
              <div>
                <label htmlFor="locality" className="block text-sm font-medium text-gray-700 mb-2">
                  Locality / Area <span className="text-red-500">*</span>
                </label>
                <select
                  id="locality"
                  name="locality"
                  required
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-green focus:border-transparent"
                >
                  <option value="">Select your area</option>
                  <option value="Whitefield">Whitefield</option>
                  <option value="Indiranagar">Indiranagar</option>
                  <option value="Koramangala">Koramangala</option>
                  <option value="Hebbal">Hebbal</option>
                  <option value="HSR Layout">HSR Layout</option>
                  <option value="JP Nagar">JP Nagar</option>
                  <option value="Bellandur">Bellandur</option>
                  <option value="Yelahanka">Yelahanka</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Message */}
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                  Message / Notes
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-green focus:border-transparent"
                  placeholder="Tell us about your space or any specific requirements…"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-green text-white py-4 rounded-2xl font-semibold text-lg hover:bg-green-dark transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Sending…" : "Send Request"}
              </button>

              {/* General error */}
              {errors?.general ? (
                <p className="text-red-600 text-sm mt-2">{String(errors.general)}</p>
              ) : null}
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}