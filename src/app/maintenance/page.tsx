"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function MaintenancePage() {
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
                  Never worry about your plants again.
                </h1>
                <p className="text-lg text-gray-700">
                  Bi-weekly or monthly balcony maintenance by trained gardeners, monitored by professional Horticulturists — starting at ₹999/mo. 
                  <span className="font-semibold text-green"> Includes a 1-month free trial.</span>
                </p>

                <a
                  href="/contact"
                  className="inline-block bg-green text-white px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-green-dark transition-colors shadow-lg"
                >
                  Start Free Trial
                </a>
              </div>

              {/* Right: gardener photo */}
              <div className="order-first md:order-last">
                <div className="overflow-hidden rounded-2xl shadow-card">
                  <Image
                    src="/images/inspo/balcony_small_day.png"
                    alt="Professional gardener maintaining balcony plants"
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

      {/* What's Included Section */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-center text-green-dark mb-12">
            Every visit includes
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: "💧", title: "Watering" },
              { icon: "✂️", title: "Pruning & cleaning" },
              { icon: "🐛", title: "Pest control" },
              { icon: "🌿", title: "Fertilizer check" },
              { icon: "🪴", title: "Pot & soil health inspection" },
              { icon: "🧹", title: "Basic balcony cleanup" }
            ].map((item, index) => (
              <div key={index} className="text-center p-6 bg-cream rounded-2xl">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="font-semibold text-green-dark">{item.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Service Report Mock */}
      <section className="py-12 bg-cream">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            {/* Left: Sample Report Image */}
            <div className="order-2 md:order-1">
              <div className="bg-gray-100 rounded-2xl p-8 shadow-card">
                <div className="p-4 rounded-lg bg-white shadow-md text-gray-800 leading-relaxed">
                  <h3 className="font-semibold text-lg text-green-900 mb-2">Service Report – Sept 7, 2025</h3>
                  <ul className="space-y-1 pl-1">
                    <li className="flex items-start"><span className="text-green-600 mr-2">✓</span>Soil Care: Aerated soil and improved water retention.</li>
                    <li className="flex items-start"><span className="text-green-600 mr-2">✓</span>Pruning: Trimmed for lateral growth; Bougainvillea shaped.</li>
                    <li className="flex items-start"><span className="text-green-600 mr-2">✓</span>Creepers: Maintained pergola and rail creepers.</li>
                    <li className="flex items-start"><span className="text-green-600 mr-2">✓</span>Vermicompost: Last applied Sept 7; next due Dec 7, 2025.</li>
                  </ul>

                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <h4 className="font-semibold text-green-800 mb-1 flex items-center">
                      <span className="mr-1">💧</span> Recommended Watering Schedule
                    </h4>
                    <ul className="space-y-1 pl-1">
                      <li className="flex items-start"><span className="text-green-600 mr-2">✓</span>Flowering plants & shrubs — once in 2–3 days.</li>
                      <li className="flex items-start"><span className="text-green-600 mr-2">✓</span>Lawn — once in 3–4 days.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Text Content */}
            <div className="order-1 md:order-2">
              <h2 className="text-3xl md:text-4xl font-display font-bold text-green-dark mb-6">
                Transparency you can trust.
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                After every visit, you receive a digital service report — what was done, 
                plant health updates, and next steps.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Plans & Pricing Section */}
      <section className="pt-12 pb-16 md:pb-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-green-dark mb-4">
              Choose your plan
            </h2>
            <div className="inline-block bg-yellow text-green-dark px-6 py-3 rounded-full font-semibold mb-8">
              Try us free for the first month — cancel anytime.
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Monthly Care */}
            <div className="bg-white rounded-2xl p-8 shadow-card border border-gray-200">
              <h3 className="text-2xl font-display font-semibold text-green-dark mb-4">
                Monthly Care
              </h3>
              <div className="text-4xl font-bold text-green mb-4">₹999/month</div>
              <p className="text-gray-600 mb-6">
                1 visit/month · Watering, pruning, basic check-up.
              </p>
              <ul className="space-y-3 mb-8 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-green text-lg">🌿</span>
                  <span>Monthly plant health check</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green text-lg">💧</span>
                  <span>Watering, pruning & cleaning</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green text-lg">🐛</span>
                  <span>Pest control</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green text-lg">🌱</span>
                  <span>Application of Fertilizer and Compost</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green text-lg">📄</span>
                  <span>Digital service report by horticulturist</span>
                </li>
              </ul>
            </div>

            {/* Bi-Weekly Care */}
            <div className="bg-white rounded-2xl p-8 shadow-card border-2 border-green relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-yellow text-green-dark px-4 py-1 rounded-full text-sm font-semibold">
                Most Popular
              </div>
              <h3 className="text-2xl font-display font-semibold text-green-dark mb-4">
                Bi-Weekly Care
              </h3>
              <div className="text-4xl font-bold text-green mb-4">₹1,499/month</div>
              <p className="text-gray-600 mb-6">
                2 visits/month · Watering, pruning, cleaning, pest control.
              </p>
              <ul className="space-y-3 mb-8 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-green text-lg">🌿</span>
                  <span>Bi-weekly plant health check</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green text-lg">💧</span>
                  <span>Watering, pruning & cleaning</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green text-lg">🐛</span>
                  <span>Pest control</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green text-lg">🌱</span>
                  <span>Application of Fertilizer and Compost</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green text-lg">📄</span>
                  <span>Digital service report by horticulturist</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="max-w-4xl mx-auto text-center mt-10 md:mt-14">
            <h2 className="text-2xl md:text-3xl font-display font-semibold text-green-dark">
              Join hundreds of Bengaluru homes already trusting Nuvvy with their plants.
            </h2>
            <p className="text-gray-600 mt-3">
              Pick a plan that fits your routine—then book a quick trial visit to get started.
            </p>
            <div className="mt-6">
              <a
                href="#trial-form"
                className="inline-block bg-green text-white px-6 md:px-8 py-3 md:py-4 rounded-2xl font-semibold hover:bg-green-dark transition-colors shadow-lg"
              >
                Start My Free Trial
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
