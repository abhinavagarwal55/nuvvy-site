"use client";

import Image from "next/image";
import { getWhatsAppLink, WHATSAPP_MESSAGES, WHATSAPP_NUMBER, PHONE_DISPLAY } from "@/config/whatsapp";
import TrackedLink from "@/components/TrackedLink";

/**
 * Snabbit-style hero component
 * Center-aligned, calm, premium ATF with image below text
 * Note: Header is now in the layout, not in this component
 */
export default function SnabbitHero() {
  return (
    <section className="w-full bg-white py-8 md:py-12">
      <div className="max-w-[640px] mx-auto px-6">
        {/* Content + Image - Single rounded container for visual blending */}
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          {/* Text Block - Center aligned, constrained width */}
          <div className="text-center space-y-4 px-6 pt-8 pb-6">
            {/* Headline - outcome-focused */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl text-[#1F3D2B] leading-tight max-w-lg mx-auto font-semibold">
              The green balcony you&apos;ve always wanted — finally, without the guesswork
            </h1>

            {/* Subtext - differentiators + price anchor */}
            <p className="text-lg md:text-xl text-gray-600 max-w-md mx-auto">
              Horticulturist-led care. Fertilizer and pest control included. Starting at ₹999/month.
            </p>

            {/* Hero CTA */}
            <div className="pt-2">
              <TrackedLink
                href={getWhatsAppLink(WHATSAPP_MESSAGES.balconyAssessment)}
                event="whatsapp_click"
                cta="hero"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-md"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                <span>Get a free balcony assessment</span>
              </TrackedLink>
              {PHONE_DISPLAY && (
                <div className="mt-3">
                  <TrackedLink
                    href={`tel:+${WHATSAPP_NUMBER}`}
                    event="call_click"
                    cta="hero"
                    className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium px-6 py-2.5 rounded-lg transition-colors"
                    aria-label={`Call Nuvvy at ${PHONE_DISPLAY}`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>Call {PHONE_DISPLAY}</span>
                  </TrackedLink>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">No commitment · Whitefield, Bangalore</p>
            </div>
          </div>

          {/* Image - Immediately below text, minimal spacing, full-width within container */}
          <div className="relative w-full overflow-hidden">
            <Image
              src="/images/whatsapp_main_image.png"
              alt="Professional balcony garden care in Bangalore by Nuvvy"
              width={1200}
              height={800}
              className="w-full h-auto object-cover"
              priority
              unoptimized
            />
          </div>
        </div>
      </div>
    </section>
  );
}
