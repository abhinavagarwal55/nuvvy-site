"use client";

import { PRICING_TITLE } from "@/config/pricing";
import { getWhatsAppLink, WHATSAPP_MESSAGES } from "@/config/whatsapp";

export default function SimplePricing() {
  return (
    <section id="pricing" className="py-8 bg-white">
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
              className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold px-6 py-3 rounded-full transition-colors shadow-lg"
            >
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              <span>Get exact pricing for your balcony</span>
            </a>
          </div>
        </div>
    </section>
  );
}
