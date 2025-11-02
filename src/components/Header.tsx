"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Close on route change hash clicks (best-effort) and on resize up to md
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 ${
        scrolled ? "shadow-lg" : "shadow-sm"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-6 lg:px-8 py-3">
        {/* Logo: next/image for optimized loading and proper alt text for a11y */}
        <Link href="/" className="absolute left-1/2 -translate-x-1/2 md:static md:transform-none">
          <Image
            src="/images/inspo/nuvvy_logo_transparent_small.png"
            alt="Nuvvy logo - Elevate Your Green Space"
            width={200}
            height={60}
            className="h-12 md:h-14 w-auto"
            priority
          />
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden md:flex gap-6 text-base font-medium text-gray-700">
          <a href="/" className="hover:text-green transition-colors">Home</a>
          <a href="/design" className="hover:text-green transition-colors">Design</a>
          <a href="/maintenance" className="hover:text-green transition-colors">Maintenance</a>
        </nav>

        {/* Desktop primary CTA */}
        <a
          href="/contact"
          className="hidden md:inline-block bg-green text-white font-semibold rounded-full px-4 py-2 text-sm shadow-soft hover:bg-green-dark nv-focus"
        >
          Contact Us
        </a>

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden inline-flex items-center gap-2 rounded-full px-3 py-2 border border-border text-sm nv-focus"
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          Menu
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`transition-transform ${open ? "rotate-180" : "rotate-0"}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Mobile menu panel */}
      <div
        id="mobile-menu"
        className={`md:hidden overflow-hidden transition-all duration-200 ${
          open ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="container mx-auto px-6 lg:px-8 pb-3">
          <div className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            <a href="/" className="rounded-xl px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>
              Home
            </a>
            <a href="/design" className="rounded-xl px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>
              Design
            </a>
            <a href="/maintenance" className="rounded-xl px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>
              Maintenance
            </a>
            <a
              href="/contact"
              className="mt-1 inline-flex items-center justify-center bg-green text-white font-semibold rounded-full px-4 py-2 text-sm shadow-soft hover:bg-green-dark nv-focus"
              onClick={() => setOpen(false)}
            >
              Contact Us
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}