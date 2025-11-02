"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function Home() {
  // Simple fade-in on mount (no extra libs)
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => setIsVisible(true), []);

  return (
    <main className="bg-cream">
      {/* 1️⃣ Hero Section with Integrated Service Cards */}
      <section id="hero" className="py-10 md:py-16 bg-gradient-to-br from-[#f0f8f0] via-[#f5f5f0] to-[#e8f5e8] shadow-inner relative after:absolute after:inset-x-0 after:bottom-0 after:h-20 after:bg-gradient-to-t after:from-[#f0f8f0] after:to-transparent after:pointer-events-none">
        <div className="container mx-auto px-6 max-w-6xl">
          {/* Premium glass-morphism container */}
          <div className="rounded-3xl bg-white/65 backdrop-blur-md border border-white/60 shadow-[0_6px_30px_rgba(16,24,40,0.08)] p-6 md:p-10">
            {/* Hero content */}
            <div
              className={`transition-opacity duration-700 ${
                isVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              {/* Main hero text - centered */}
              <div className="text-center mb-8 max-w-4xl mx-auto">
                {/* Small pill badge */}
                <span className="inline-block bg-mist text-text px-3 py-1 rounded-pill text-sm border border-border mb-4">
                  Balcony & Garden Design
                </span>

                {/* Primary headline */}
                <h1 className="text-4xl md:text-5xl font-display font-semibold leading-tight mb-4">
                  Turn your balcony into a lush, low-effort sanctuary.
                </h1>

                {/* Subtext */}
                <p className="text-ink/80 text-lg mb-6">
                  From design to ongoing maintenance, Nuvvy helps you create and care for beautiful green spaces.
                </p>

                {/* CTAs - More prominent styling */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <a
                    href="/design"
                    className="inline-flex items-center justify-center rounded-pill px-6 py-3.5 bg-green text-white font-semibold hover:bg-green-dark shadow-lg nv-focus text-base"
                  >
                    Explore Design
                  </a>
                  <a
                    href="/maintenance"
                    className="inline-flex items-center justify-center rounded-pill px-6 py-3.5 bg-green text-white font-semibold hover:bg-green-dark shadow-lg nv-focus text-base"
                  >
                    Explore maintenance plans
                  </a>
                </div>
              </div>

              {/* Compact Service Cards - side by side below hero text */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                {/* Garden Design Card */}
                <a href="/design" className="group block">
                  <div className="nv-card overflow-hidden rounded-xl shadow-card transition-transform duration-300 group-hover:scale-[1.02]">
                    <div className="aspect-[16/9]">
        <Image
                        src="/images/inspo/balcony_large_with_furniture.png"
                        alt="Beautifully designed balcony with modern furniture and lush plants"
                        width={600}
                        height={338}
                        className="h-full w-full object-cover"
                        loading="eager"
          priority
        />
                    </div>
                    <div className="p-4 text-center">
                      <h3 className="text-lg font-semibold text-green-dark">Garden Design</h3>
                      <p className="text-sm text-gray-600 mt-1">Transform your space</p>
                    </div>
                  </div>
                </a>

                {/* Garden Maintenance Card */}
                <a href="/maintenance" className="group block">
                  <div className="nv-card overflow-hidden rounded-xl shadow-card transition-transform duration-300 group-hover:scale-[1.02]">
                    <div className="aspect-[16/9]">
            <Image
                        src="/images/inspo/Nuvvy_gardner_10.png"
                        alt="Professional gardener maintaining balcony plants"
                        width={600}
                        height={338}
                        className="h-full w-full object-cover"
                        loading="eager"
                        priority
                      />
                    </div>
                    <div className="p-4 text-center">
                      <h3 className="text-lg font-semibold text-green-dark">Maintenance</h3>
                      <p className="text-sm text-gray-600 mt-1">Keep it thriving</p>
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2️⃣ Inspiration Gallery Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-display font-semibold text-green-dark mb-3">
              Inspiration Gallery
            </h2>
            <p className="text-lg text-gray-700">
              See how a few plants and creative design can transform your balcony.
            </p>
          </div>
          
          {/* Image grid - 3 columns on desktop, horizontal scroll on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="overflow-hidden rounded-xl shadow-card">
              <Image
                src="/images/inspo/balcony_small_day_2.png"
                alt="Before and after balcony transformation"
                width={400}
                height={300}
                className="h-64 w-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="overflow-hidden rounded-xl shadow-card">
              <Image
                src="/images/inspo/balcony_large_with_furniture.png"
                alt="Lush balcony transformation with seating"
                width={400}
                height={300}
                className="h-64 w-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="overflow-hidden rounded-xl shadow-card">
              <Image
                src="/images/inspo/balcony_long_day.png"
                alt="Modern balcony makeover"
                width={400}
                height={300}
                className="h-64 w-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3️⃣ Why Design Your Balcony - Visual & Aspirational */}
      <section className="py-16 bg-cream">
        <div className="container mx-auto px-6 max-w-6xl">
          {/* Header & Subtext */}
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-semibold text-green-dark mb-4">
              Your balcony isn't just a corner — it's your everyday escape.
            </h2>
            <p className="text-lg text-gray-700 max-w-2xl mx-auto">
              A little green, a little light, and a space that's all yours.
            </p>
          </div>
          
          {/* Three lifestyle image cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            {/* Card 1: Upgrade Your Home */}
            <div className="group">
              <div className="overflow-hidden rounded-2xl shadow-card mb-4">
                <Image
                  src="/images/inspo/nuvvy_upgrade_home_compressed.jpg"
                  alt="Beautifully designed balcony as an extension of living room"
                  width={400}
                  height={500}
                  className="w-full aspect-square md:aspect-[3/4] object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <h3 className="text-xl font-semibold text-green-dark mb-2 flex items-center gap-2">
                <span className="text-2xl">🪴</span>
                Upgrade Your Home
              </h3>
              <p className="text-gray-700">
                Turn your balcony into a natural extension of your living room.
              </p>
            </div>

            {/* Card 2: Find Your Calm */}
            <div className="group">
              <div className="overflow-hidden rounded-2xl shadow-card mb-4">
                <Image
                  src="/images/inspo/nuvvy_find_your_calm_compressed.jpg"
                  alt="Peaceful morning coffee surrounded by green plants"
                  width={400}
                  height={500}
                  className="w-full aspect-square md:aspect-[3/4] object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <h3 className="text-xl font-semibold text-green-dark mb-2 flex items-center gap-2">
                <span className="text-2xl">☀️</span>
                Find Your Calm
              </h3>
              <p className="text-gray-700">
                Start your day with coffee and birdsong, surrounded by green.
              </p>
            </div>

            {/* Card 3: Moments That Matter */}
            <div className="group">
              <div className="overflow-hidden rounded-2xl shadow-card mb-4">
                <Image
                  src="/images/inspo/nuvvy_moments_matter_compressed.jpg"
                  alt="Evening gatherings with family under ambient lights"
                  width={400}
                  height={500}
                  className="w-full aspect-square md:aspect-[3/4] object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <h3 className="text-xl font-semibold text-green-dark mb-2 flex items-center gap-2">
                <span className="text-2xl">🎉</span>
                Moments That Matter
              </h3>
              <p className="text-gray-700">
                Evenings under lights with family and laughter.
              </p>
            </div>
          </div>

          {/* CTA below cards */}
          <div className="text-center">
            <a
              href="/design"
              className="inline-flex items-center gap-2 text-green font-semibold hover:text-green-dark transition-colors text-lg"
            >
              See what's possible → Explore Design Packages
            </a>
          </div>
        </div>
      </section>

      {/* 4️⃣ Garden Design Summary Card */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="nv-card p-8 md:p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Left: Text content */}
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-semibold text-green-dark mb-4">
                  Garden Design Packages starting ₹15,000
                </h2>
                <p className="text-lg text-gray-700 mb-6">
                  End-to-end balcony makeovers including plants, lighting, flooring, and furniture — handled by our expert designers.
                </p>
                <a
                  href="/design"
                  className="inline-block bg-green text-white rounded-xl px-6 py-3 font-semibold hover:bg-green-dark shadow-soft nv-focus"
                >
                  Explore Design Packages
                </a>
              </div>
              
              {/* Right: Image */}
              <div className="order-first md:order-last">
                <div className="overflow-hidden rounded-xl shadow-card">
                  <Image
                    src="/images/inspo/balcony_large_with_furniture.png"
                    alt="Beautifully designed balcony with modern furniture and lush plants"
                    width={500}
                    height={400}
                    className="h-80 w-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5️⃣ Maintenance Summary Card */}
      <section className="py-16 bg-cream">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="nv-card p-8 md:p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Left: Image with caption */}
              <div>
                <div className="overflow-hidden rounded-xl shadow-card mb-3">
          <Image
                    src="/images/inspo/Nuvvy_gardner_10.png"
                    alt="Professional Nuvvy gardener maintaining balcony plants"
                    width={500}
                    height={400}
                    className="h-80 w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <p className="text-sm text-gray-600 italic text-center">
                  Our gardeners at work — keeping Bengaluru's balconies thriving.
                </p>
              </div>
              
              {/* Right: Text content */}
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-semibold text-green-dark mb-4">
                  Maintenance Plans starting ₹999/month
                </h2>
                <p className="text-lg text-gray-700 mb-6">
                  Weekly or monthly visits for watering, pruning, and cleaning — keep your plants thriving with zero effort. Try us free for the first month.
                </p>
                <a
                  href="/maintenance"
                  className="inline-block bg-green text-white rounded-xl px-6 py-3 font-semibold hover:bg-green-dark shadow-soft nv-focus"
                >
                  Start Your Free Trial
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6️⃣ Contact Section */}
      <section id="contact" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-display font-semibold text-green-dark mb-4">
              Get in touch
            </h2>
            <p className="text-lg text-gray-700 mb-8 max-w-2xl mx-auto">
              Tell us what you need — design or maintenance — and we'll get back within a day.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <a
                href="/contact"
                className="inline-block bg-green text-white rounded-xl px-8 py-4 font-semibold text-lg hover:bg-green-dark shadow-soft nv-focus"
              >
                Contact Us
              </a>
            </div>
            
            {/* Email icon */}
            <div className="flex justify-center gap-6">
              <a
                href="mailto:hello@nuvvy.com"
                className="text-green hover:text-green-dark transition-colors"
                aria-label="Send us an email"
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
              </a>
            </div>
          </div>
    </div>
      </section>

    </main>
  );
}
