"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function DesignPage() {
  const [isVisible, setIsVisible] = useState(false);

  // Simple fade-in on mount
  useEffect(() => setIsVisible(true), []);

  return (
    <main className="bg-cream">
      {/* Hero Section */}
      <section className="py-8 md:py-20 bg-gradient-to-br from-[#f0f8f0] via-[#f5f5f0] to-[#e8f5e8] shadow-inner relative after:absolute after:inset-x-0 after:bottom-0 after:h-20 after:bg-gradient-to-t after:from-[#f0f8f0] after:to-transparent after:pointer-events-none">
        <div className="container mx-auto px-6">
          {/* Premium glass-morphism container */}
          <div className="rounded-3xl bg-white/65 backdrop-blur-md border border-white/60 shadow-[0_6px_30px_rgba(16,24,40,0.08)] p-6 md:p-10">
            {/* Two-column responsive grid */}
            <div
              className={`grid grid-cols-1 md:grid-cols-2 gap-10 items-center transition-opacity duration-700 ${
                isVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              {/* Left: text content */}
              <div className="space-y-6">
                <h1 className="text-4xl md:text-5xl font-display font-bold text-green-dark leading-tight">
                  Transform your balcony into a living space you love.
                </h1>
                <p className="text-lg text-gray-700">
                  From lighting and flooring to plant selection and maintenance — we design green spaces that match your lifestyle.
                </p>

                <a
                  href="/contact"
                  className="inline-block bg-green text-white px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-green-dark transition-colors shadow-lg"
                >
                  Book Free Design Consultation
                </a>
              </div>

              {/* Right: balcony design photo */}
              <div className="order-first md:order-last">
                <div className="overflow-hidden rounded-2xl shadow-card">
                  <Image
                    src="/images/inspo/balcony_large_with_furniture.png"
                    alt="Beautifully designed balcony with plants, furniture, and lighting"
                    width={500}
                    height={400}
                    className="h-80 w-full object-cover"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Go For Balcony Design */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-green-dark mb-4">
              Why design your balcony?
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-12">
            <div className="text-center p-6">
              <div className="text-4xl mb-4">🏠</div>
              <h3 className="text-xl font-display font-semibold text-green-dark mb-3">
                Upgrade Your Home
              </h3>
              <p className="text-gray-600">
                We spend on interiors, but balconies are often left empty. You can transform them to match the design level of your interiors.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="text-4xl mb-4">🧘</div>
              <h3 className="text-xl font-display font-semibold text-green-dark mb-3">
                Your Calm Corner
              </h3>
              <p className="text-gray-600">
                Create a green space where you can unwind, meditate, or enjoy coffee with family.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="text-4xl mb-4">👥</div>
              <h3 className="text-xl font-display font-semibold text-green-dark mb-3">
                For Family & Friends
              </h3>
              <p className="text-gray-600">
                Make your balcony an inviting space to entertain guests and spend quality time together.
              </p>
            </div>
          </div>

          {/* Lifestyle Photos Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              { src: "/images/inspo/balcony_small_day_2.png", alt: "Family enjoying morning coffee on balcony" },
              { src: "/images/inspo/balcony_small_day_3.png", alt: "Relaxing evening on beautifully designed balcony" },
              { src: "/images/inspo/balcony_small_day_mountains.png", alt: "Peaceful balcony with mountain views" },
              { src: "/images/inspo/balcony_v_small_vertical_garden.png", alt: "Vertical garden creating privacy and beauty" }
            ].map((img, index) => (
              <div key={index} className="group overflow-hidden rounded-2xl shadow-card">
                <Image
                  src={img.src}
                  alt={img.alt}
                  width={300}
                  height={200}
                  className="h-32 w-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Nuvvy */}
      <section className="py-12 bg-cream">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-green-dark mb-4">
              Why choose us?
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              We take care of everything — end to end.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: "🎨", title: "Complete design", desc: "lights, flooring & plants" },
              { icon: "👁️", title: "See visual mocks", desc: "before deciding" },
              { icon: "💡", title: "Innovative layouts", desc: "& accessories" },
              { icon: "☀️", title: "Plant selection", desc: "tailored to your balcony's sunlight & wind" },
              { icon: "💧", title: "Drip irrigation", desc: "for hassle-free watering" },
              { icon: "🌱", title: "Post-installation", desc: "maintenance" }
            ].map((item, index) => (
              <div key={index} className="text-center p-6 bg-white rounded-2xl shadow-card">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="font-semibold text-green-dark mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-green-dark mb-4">
              How it works
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {/* Step 1 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green text-white rounded-full text-2xl font-bold mb-4">
                1
              </div>
              <div className="text-3xl mb-3">📸</div>
              <h3 className="text-lg font-display font-semibold text-green-dark mb-3">
                Share your photos
              </h3>
              <p className="text-gray-600 text-sm">
                Upload balcony pictures & choose a package.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green text-white rounded-full text-2xl font-bold mb-4">
                2
              </div>
              <div className="text-3xl mb-3">🎨</div>
              <h3 className="text-lg font-display font-semibold text-green-dark mb-3">
                Design review
              </h3>
              <p className="text-gray-600 text-sm">
                Our designers share visual designs and iterate with you.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green text-white rounded-full text-2xl font-bold mb-4">
                3
              </div>
              <div className="text-3xl mb-3">🔧</div>
              <h3 className="text-lg font-display font-semibold text-green-dark mb-3">
                Installation day
              </h3>
              <p className="text-gray-600 text-sm">
                We install everything within a day.
              </p>
            </div>

            {/* Step 4 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green text-white rounded-full text-2xl font-bold mb-4">
                4
              </div>
              <div className="text-3xl mb-3">🌿</div>
              <h3 className="text-lg font-display font-semibold text-green-dark mb-3">
                Ongoing maintenance
              </h3>
              <p className="text-gray-600 text-sm">
                Optional plan to keep it thriving.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="py-12 bg-cream">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-green-dark mb-4">
              Choose your design package
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Starter Balcony */}
            <div className="bg-white rounded-2xl p-8 shadow-card border border-gray-200">
              <h3 className="text-2xl font-display font-semibold text-green-dark mb-4">
                Starter Balcony
              </h3>
              <div className="text-3xl font-bold text-green mb-4">₹15,000–₹20,000</div>
              <ul className="space-y-3 mb-8 text-sm text-gray-600">
                <li>• 6–8 plants</li>
                <li>• Lighting setup</li>
                <li>• Pots & décor</li>
                <li>• Basic design consultation</li>
              </ul>
            </div>

            {/* Premium Sanctuary */}
            <div className="bg-white rounded-2xl p-8 shadow-card border-2 border-green relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-yellow text-green-dark px-4 py-1 rounded-full text-sm font-semibold">
                Most Popular
              </div>
              <h3 className="text-2xl font-display font-semibold text-green-dark mb-4">
                Premium Sanctuary
              </h3>
              <div className="text-3xl font-bold text-green mb-4">₹30,000–₹40,000</div>
              <ul className="space-y-3 mb-8 text-sm text-gray-600">
                <li>• 10–14 plants</li>
                <li>• Deck tiles</li>
                <li>• Premium lighting</li>
                <li>• Seating & furniture</li>
                <li>• Complete design package</li>
              </ul>
            </div>

            {/* Custom Design */}
            <div className="bg-white rounded-2xl p-8 shadow-card border border-gray-200">
              <h3 className="text-2xl font-display font-semibold text-green-dark mb-4">
                Custom Design
              </h3>
              <div className="text-3xl font-bold text-green mb-4">Custom</div>
              <ul className="space-y-3 mb-8 text-sm text-gray-600">
                <li>• Tailored to your space</li>
                <li>• Premium materials</li>
                <li>• Custom furniture</li>
                <li>• Advanced lighting</li>
                <li>• Personal consultation</li>
              </ul>
            </div>
          </div>

          <div className="max-w-5xl mx-auto text-center mt-10 md:mt-14">
            <h2 className="text-2xl md:text-3xl font-display font-semibold text-green-dark">
              Ready to fall in love with your balcony?
            </h2>
            <p className="text-gray-600 mt-3">
              Share a few details and we'll shape a plan that fits your space and budget.
            </p>
            <div className="mt-6">
              <a
                href="/contact?service=design"
                className="inline-block bg-green text-white px-6 md:px-8 py-3 md:py-4 rounded-2xl font-semibold hover:bg-green-dark transition-colors shadow-lg"
              >
                Contact Us
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
