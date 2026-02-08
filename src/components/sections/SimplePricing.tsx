"use client";

import { Check } from "lucide-react";
import { PRICING_TITLE, PRICING_SUBTITLE, GARDEN_CARE_PRICING, PRICING_INCLUSIONS } from "@/config/pricing";
import { getWhatsAppLink, WHATSAPP_MESSAGES } from "@/config/whatsapp";

export default function SimplePricing() {
  return (
    <section className="py-8 bg-white">
      <div className="max-w-2xl">
        <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-2">
          {PRICING_TITLE}
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          {PRICING_SUBTITLE}
        </p>

        {/* Pricing Container */}
        <div className="bg-stone-50 rounded-xl p-4 md:p-5 mb-6">
          {/* Pricing Rows */}
          <div className="space-y-0">
            {GARDEN_CARE_PRICING.map((tier, idx) => (
              <div
                key={idx}
                className={idx < GARDEN_CARE_PRICING.length - 1 ? "pb-3 border-b border-gray-200" : "pt-3 pb-0"}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900 mb-1.5">{tier.label}</h3>
                  </div>
                  {tier.monthlyPrice ? (
                    <div className="text-right flex-shrink-0">
                      <div className="text-xl font-semibold text-gray-900">
                        ₹{tier.monthlyPrice.toLocaleString("en-IN")} / month
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ≈ ₹{tier.perVisitPrice.toLocaleString("en-IN")} per visit
                      </p>
                    </div>
                  ) : (
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm text-gray-600">{tier.cadence}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Included in Care */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Included in your care:
            </h3>
            <div className="space-y-3">
              {PRICING_INCLUSIONS.map((inclusion, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-emerald-600" stroke="currentColor" strokeWidth={2.5} />
                  </div>
                  <p className="text-sm text-gray-700">{inclusion}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA 2 - Pricing Section */}
          <div className="mt-6">
            <a
              href={getWhatsAppLink(WHATSAPP_MESSAGES.pricingInquiry)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold px-6 py-3 rounded-full text-center transition-colors shadow-lg"
            >
              Get exact pricing for your balcony
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
