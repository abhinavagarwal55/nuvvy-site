"use client";

import { PRICING_TITLE } from "@/config/pricing";
import { getWhatsAppLink, WHATSAPP_MESSAGES } from "@/config/whatsapp";
import TrackedLink from "@/components/TrackedLink";

interface PricingCard {
  key: string;
  title: string;
  price: string;
  subprice: string;
  inclusions: string[];
  bestFor: string;
  ctaLabel: string;
  message: string;
  highlighted?: boolean;
}

const PRICING_CARDS: PricingCard[] = [
  {
    key: "one-time",
    title: "One-Time Service",
    price: "₹399/hour",
    subprice: "No minimum commitment",
    inclusions: [
      "Basic pruning & cleaning",
      "Soil aeration",
      "Fertilizer and Pest control included",
    ],
    bestFor: "Quick fixes, seasonal cleanup",
    ctaLabel: "Book a Visit",
    message: WHATSAPP_MESSAGES.oneTimeService,
  },
  {
    key: "regular",
    title: "Regular Care",
    price: "Starting ₹399/month",
    subprice: "Monthly • Bi-weekly visits • Price varies by number of plants",
    inclusions: [
      "Everything in one-time service",
      "Micro nutrients & vermi compost",
      "Horticulturist-led guidance",
    ],
    bestFor: "Year-round healthy garden",
    ctaLabel: "Get pricing",
    message: WHATSAPP_MESSAGES.regularCarePlan,
    highlighted: true,
  },
  {
    key: "plant-order",
    title: "Plant Order & Setup",
    price: "Custom",
    subprice: "Get a quote • 200+ plants to choose from",
    inclusions: [
      "Curated plant list by horticulturist",
      "Procurement from trusted nurseries",
      "Installation in right soil mix",
      "Pot & planter recommendations",
    ],
    bestFor: "Adding greenery to your indoor and outdoor spaces",
    ctaLabel: "Get my curated plant list",
    message: WHATSAPP_MESSAGES.plantOrdering,
  },
];

function WhatsAppIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export default function SimplePricing() {
  return (
    <section id="pricing" className="py-8 bg-white">
      {/* Pricing Container */}
      <div className="bg-[#F9FAFB] rounded-3xl border border-gray-200 p-6 md:p-10 mt-6">
        {/* Section Title */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900">
            {PRICING_TITLE}
          </h2>
        </div>

        {/* Three-tier pricing grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {PRICING_CARDS.map((card) => (
            <div
              key={card.key}
              className={`relative flex flex-col rounded-2xl p-6 ${
                card.highlighted
                  ? "bg-mist border-2 border-leaf shadow-md md:-my-2"
                  : "bg-white border border-gray-200"
              }`}
            >
              {card.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-leaf px-3 py-1 text-xs font-semibold text-white shadow">
                  Recommended
                </span>
              )}

              {/* Title */}
              <h3 className="text-xl font-semibold text-ink">{card.title}</h3>

              {/* Price */}
              <p className="mt-3 text-3xl font-bold text-ink">{card.price}</p>
              <p className="mt-1 text-sm text-gray-500">{card.subprice}</p>

              {/* Inclusions */}
              <ul className="mt-5 space-y-3 flex-1">
                {card.inclusions.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-base text-gray-700"
                  >
                    <span className="text-[#16a34a] font-bold text-lg leading-none">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              {/* Best for */}
              <p className="mt-5 text-sm text-gray-500">
                <span className="font-medium text-gray-700">Best for:</span>{" "}
                {card.bestFor}
              </p>

              {/* CTA */}
              <TrackedLink
                href={getWhatsAppLink(card.message)}
                event="whatsapp_click"
                cta={`pricing_${card.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-5 flex items-center justify-center gap-2 w-full font-semibold px-6 py-3 rounded-full transition-colors shadow ${
                  card.highlighted
                    ? "bg-[#25D366] hover:bg-[#20BA5A] text-white"
                    : "bg-white border border-gray-300 text-gray-800 hover:bg-gray-50"
                }`}
              >
                <WhatsAppIcon />
                <span>{card.ctaLabel}</span>
              </TrackedLink>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
