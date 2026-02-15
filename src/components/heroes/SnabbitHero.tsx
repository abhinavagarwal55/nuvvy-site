"use client";

import Image from "next/image";

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
          <div className="text-center space-y-4 px-6 pt-8 pb-4">
            {/* Headline - Two lines with deliberate hierarchy */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl text-[#1F3D2B] leading-tight max-w-lg mx-auto">
              <span className="font-medium">India's First</span>
              <br />
              <span className="font-semibold">Professional Garden Care Service</span>
            </h1>

            {/* Subtext - Muted gray */}
            <p className="text-lg md:text-xl text-gray-600 max-w-md mx-auto">
              Horticulturist-led care and plant selection for green balconies and Indoors
            </p>
          </div>

          {/* Image - Immediately below text, minimal spacing, full-width within container */}
          <div className="relative w-full overflow-hidden">
            <Image
              src="/images/whatsapp_main_image.png"
              alt="Professional garden care"
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
