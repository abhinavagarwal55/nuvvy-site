"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, Phone } from "lucide-react";
import { WHATSAPP_NUMBER, PHONE_DISPLAY } from "@/config/whatsapp";

/**
 * Landing page header - sticky header with Nuvvy logo and hamburger menu
 * Used across all public pages for consistent navigation
 */
export default function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur pt-3 pb-3">
      <div className="max-w-[640px] mx-auto px-6">
        <div className="bg-white rounded-xl shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Nuvvy Logo/Text */}
            <Link href="/" className="text-xl font-semibold text-green-700 hover:text-green-800 transition-colors">
              Nuvvy
            </Link>

            {/* Phone + Hamburger */}
            <div className="flex items-center gap-1">
              {PHONE_DISPLAY && (
                <a
                  href={`tel:+${WHATSAPP_NUMBER}`}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-green-700 transition-colors px-2 py-2"
                  aria-label={`Call Nuvvy at ${PHONE_DISPLAY}`}
                >
                  <Phone className="w-4 h-4" />
                  <span className="hidden sm:inline">{PHONE_DISPLAY}</span>
                </a>
              )}
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
              <a href="/plantcatalog" className="py-4 text-sm text-gray-700 hover:text-gray-900" onClick={() => setMenuOpen(false)}>
                Plant Catalog
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
      </div>
    </header>
  );
}
