"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";

/**
 * Snabbit-style hero component
 * Center-aligned, calm, premium ATF with header and image below text
 */
export default function SnabbitHero() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section className="w-full bg-white py-8 md:py-12">
      <div className="max-w-[640px] mx-auto px-6">
        {/* Header Box - Snabbit-style */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Nuvvy Logo/Text */}
            <div className="text-xl font-semibold text-green-700">
              Nuvvy
            </div>

            {/* Hamburger Menu */}
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 text-gray-700 hover:text-gray-900 transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Menu Dropdown */}
          {menuOpen && (
            <nav className="flex flex-col px-6">
              <a href="/#garden-care" className="py-4 text-sm text-gray-700 hover:text-gray-900" onClick={() => setMenuOpen(false)}>
                Garden Care
              </a>
              <a href="/#plant-ordering" className="py-4 text-sm text-gray-700 hover:text-gray-900" onClick={() => setMenuOpen(false)}>
                Plant Ordering & Setup
              </a>
              <a href="/#pricing" className="py-4 text-sm text-gray-700 hover:text-gray-900" onClick={() => setMenuOpen(false)}>
                Pricing
              </a>
              <a href="/#contact" className="py-4 text-sm text-gray-700 hover:text-gray-900" onClick={() => setMenuOpen(false)}>
                Contact Us
              </a>
            </nav>
          )}
        </div>

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
