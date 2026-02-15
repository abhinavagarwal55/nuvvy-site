"use client";

import { PRICING_TITLE } from "@/config/pricing";
import { getWhatsAppLink, WHATSAPP_MESSAGES } from "@/config/whatsapp";

export default function SimplePricing() {
  return (
    <section className="py-8 bg-white">
      {/* Pricing Container */}
      <div className="bg-[#F9FAFB] rounded-3xl border border-gray-200 p-6 md:p-10 text-left mt-6">
          {/* Section Title */}
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900">
              {PRICING_TITLE}
            </h2>
          </div>

          {/* Garden Care Pricing */}
          <div>
            <h3 className="text-2xl font-semibold text-gray-900">
              Garden Care
            </h3>
            <p className="text-xl font-semibold text-gray-900 mt-2">
              Plans starting at ₹799 / month
            </p>
            <p className="text-base text-gray-500 mb-4">
              One visit every 2 weeks. Taxes included. Pricing varies by number of plants.
            </p>

            {/* Included in Care */}
            <ul className="space-y-3 mt-4">
              <li className="flex items-start gap-3 text-base text-gray-700">
                <span className="text-green-600">✓</span>
                Fertilizers & preventive pest control included
              </li>
              <li className="flex items-start gap-3 text-base text-gray-700">
                <span className="text-green-600">✓</span>
                Access to horticulturist guidance when needed
              </li>
              <li className="flex items-start gap-3 text-base text-gray-700">
                <span className="text-green-600">✓</span>
                Help selecting the right plants for your balcony
              </li>
            </ul>
          </div>

          {/* Divider */}
          <hr className="my-8 border-gray-300" />

          {/* Plant Ordering & Setup */}
          <div>
            <h3 className="text-2xl font-semibold text-gray-900">
              Plant Ordering & Setup
            </h3>

            {/* Primary line (catalog pricing) */}
            <p className="text-lg font-medium text-gray-900 mt-3">
              Prices vary by plant.
            </p>
            <p className="text-base text-gray-600">
              See the{" "}
              <a href="/plants" className="text-green-600 font-medium underline">
                Nuvvy Plant Catalog
              </a>
              {" "}for pricing.
            </p>

            {/* Consultation price + subscriber benefit */}
            <p className="text-lg text-gray-900 mt-5">
              ₹99 Horticulturist consultation{" "}
              <span className="text-gray-600 font-normal">
                (Free for Garden Care subscribers)
              </span>
            </p>

            {/* Tick benefit line */}
            <div className="flex items-start gap-3 text-base text-gray-700 mt-4">
              <span className="text-green-600">✓</span>
              Expert plant selection, sourcing, potting, and setup
            </div>
          </div>

          {/* CTA 2 - Pricing Section */}
          <div className="mt-10">
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
    </section>
  );
}
