"use client";

import { useState } from "react";
import { Check, X, AlertCircle, ArrowRight, LayoutGrid, UserCheck, MapPin, Flower2, RefreshCcw, Leaf, Droplet, IndianRupee, Shield } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import HeroCarousel from "@/components/HeroCarousel";
import ClassicHero from "@/components/heroes/ClassicHero";
import SnabbitHero from "@/components/heroes/SnabbitHero";
import SoundFamiliar from "@/components/sections/SoundFamiliar";
import SimplePricing from "@/components/sections/SimplePricing";
import type { HomepageContent } from "@/lib/schemas/homepage.schema";
import { WHATSAPP_MESSAGES, getWhatsAppLink } from "@/config/whatsapp";
import { HOMEPAGE_CONFIG, homepageFlags } from "@/config/homepage";

interface Plant {
  id: string;
  airtable_id?: string | null;
  name: string;
  light?: string | null;
  category?: string | null;
  watering_requirement?: string | null;
  price_band?: string | null;
  thumbnail_storage_url?: string | null;
  thumbnail_url?: string | null;
  image_storage_url?: string | null;
  image_url?: string | null;
}

interface HomepageRendererProps {
  homepageContent: HomepageContent;
  popularPlants: Plant[];
  whatsappNumber: string;
  whatsappMessage: string;
}

export default function HomepageRenderer({
  homepageContent,
  popularPlants,
  whatsappNumber,
  whatsappMessage,
}: HomepageRendererProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-white">
      {/* 1. HERO SECTION - Toggle between classic and snabbit variants */}
      {HOMEPAGE_CONFIG.heroVariant === "classic" ? (
        <ClassicHero heroes={homepageContent.heroSection.heroes} />
      ) : (
        <SnabbitHero />
      )}

      {/* Sound Familiar Section */}
      <SoundFamiliar usePublicImage={false} />

      {/* Centralized width container */}
      <div className="max-w-[640px] mx-auto px-6">

      {/* 2. MEET NUVVY */}
      <section className="bg-white pt-6 pb-12">
        <div className="bg-[#F8FAF8] rounded-3xl px-6 py-12 md:px-12 md:py-16 shadow-sm">
          <div className="space-y-10">
            {/* Heading */}
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[#1F3D2B] leading-tight mb-0">
                Meet Nuvvy
              </h2>
            </div>

            {/* Subheadline */}
            <div className="text-center -mt-1">
              <p className="text-2xl md:text-3xl font-normal text-gray-800 max-w-[720px] mx-auto leading-[1.25]">
                <span className="text-green-700 font-semibold">Horticulturist-led</span> plant care so your balcony and indoors stay <span className="text-green-700 font-semibold">green</span> — without effort.
              </p>
            </div>

            {/* Two Service Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {/* Card 1: Garden Care */}
            <a
              href="#garden-care"
              className="group bg-white rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col"
            >
              {/* Image - Top 50% of card */}
              <div className="relative w-full aspect-[4/3] overflow-hidden bg-gray-100">
                <Image
                  src="/images/Introducing_Nuvvy_Horticuturist_Image.png"
                  alt="Garden Care"
                  fill
                  className="object-cover rounded-t-2xl"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  unoptimized
                />
              </div>
              {/* Content */}
              <div className="p-6 md:p-8 flex-1 flex flex-col">
                <h3 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-3">
                  Professional Garden Care
                </h3>
                <p className="text-base md:text-lg text-gray-700 leading-relaxed">
                  Ongoing expert maintenance that keeps your plants healthy, pest-free, and thriving — without guesswork.
                </p>
              </div>
            </a>

            {/* Card 2: Plant Ordering & Setup */}
            <a
              href="#plant-setup"
              className="group bg-white rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col"
            >
              {/* Image - Top 50% of card */}
              <div className="relative w-full aspect-[4/3] overflow-hidden bg-gray-100">
                <Image
                  src="/images/plant_ordering_card.png"
                  alt="Plant Ordering & Setup"
                  fill
                  className="object-cover rounded-t-2xl"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  unoptimized
                />
              </div>
              {/* Content */}
              <div className="p-6 md:p-8 flex-1 flex flex-col">
                <h3 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-3">
                  Plant Ordering & Setup
                </h3>
                <p className="text-base md:text-lg text-gray-700 leading-relaxed">
                  Expert-led plant selection, soil preparation, and installation — fully handled for you.
                </p>
              </div>
            </a>
          </div>

          {/* CTA */}
          <div className="text-center pt-4">
            <a
              href={getWhatsAppLink(WHATSAPP_MESSAGES.balconyAssessment)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-lg"
            >
              Book a Free 30-Minute Consultation
            </a>
            <p className="text-xs text-gray-500 mt-2">No commitment</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PROFESSIONAL GARDEN CARE */}
      <section className="mt-10 mb-10">
        <div className="max-w-[640px] mx-auto px-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm px-6 py-10 md:px-10 md:py-12">
            <div className="space-y-10">
              {/* Headline */}
              <div className="text-center">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[#1F3D2B] leading-tight">
                  Professional Garden Care
                </h2>
              </div>

            {/* Three Value Pillars */}
            <div className="space-y-6 md:grid md:grid-cols-3 md:gap-8 md:space-y-0">
              {/* Block 1 */}
              <div className="flex gap-3 items-center">
                <div className="w-6 flex justify-center">
                  <span className="text-xl leading-none">✅</span>
                </div>
                <div className="flex flex-col">
                  <div className="font-medium text-base text-gray-900">
                    Horticulturist-Led Care
                  </div>
                  <div className="text-base text-gray-700 leading-snug mt-1">
                    Structured, SOP-based plant management.
                  </div>
                </div>
              </div>

              {/* Block 2 */}
              <div className="flex gap-3 items-center">
                <div className="w-6 flex justify-center">
                  <span className="text-xl leading-none">✅</span>
                </div>
                <div className="flex flex-col">
                  <div className="font-medium text-base text-gray-900">
                    Verified & Trusted Gardeners
                  </div>
                  <div className="text-base text-gray-700 leading-snug mt-1">
                    Background-checked and professionally trained.
                  </div>
                </div>
              </div>

              {/* Block 3 */}
              <div className="flex gap-3 items-center">
                <div className="w-6 flex justify-center">
                  <span className="text-xl leading-none">✅</span>
                </div>
                <div className="flex flex-col">
                  <div className="font-medium text-base text-gray-900">
                    Inputs Included
                  </div>
                  <div className="text-base text-gray-700 leading-snug mt-1">
                    Fertilizers and preventive pest control covered.
                  </div>
                </div>
              </div>
            </div>

              {/* How It Works Section */}
              <div className="space-y-10">
                <div className="text-center">
                  <h3 className="text-3xl md:text-4xl font-semibold text-gray-900">
                    How it works?
                  </h3>
                </div>
                <div className="space-y-10">
                  {homepageContent.nuvvyCareVisit.steps.map((step, idx) => {
                    const stepTitles = [
                      "Free Horticulturist Consultation",
                      "Online Appointment Confirmation & Heads-Up",
                      "Plant Health Check",
                      "Expert Preventive Care & Treatment",
                      "Post-Visit Update & Next Steps"
                    ];
                    return (
                      <div key={idx} className="relative">
                        {/* Large image */}
                        <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-gray-100">
                          <img
                            src={idx === 0 ? "/images/female_horticulturist_landscape.png" : idx === 4 ? "/images/post_completion.png" : step.imageUrl}
                            alt={stepTitles[idx]}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        {/* Step title below image */}
                        <h4 className="text-lg md:text-xl font-semibold text-gray-900 mt-6 text-center">
                          {stepTitles[idx]}
                        </h4>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. COMPARE NUVVY CARE - Custom grid layout */}
      {homepageFlags.showCompareSection && (
        <section className="py-8 bg-gray-50">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-6 text-center">
            {homepageContent.compareNuvvyCare.title}
          </h2>
          <div className="bg-white rounded-xl overflow-hidden shadow-sm text-left">
            {/* Column Headers */}
            <div className="grid grid-cols-[1fr_1fr_1.2fr] gap-4 px-4 py-4 border-b border-gray-200 bg-gray-50">
              <div className="text-sm font-semibold text-gray-900 leading-snug">
                What
              </div>
              <div className="text-sm font-semibold text-gray-700 leading-snug">
                Traditional Gardener
              </div>
              <div className="text-sm font-semibold text-green-600 leading-snug">
                Nuvvy Garden Care
              </div>
            </div>

            {/* Comparison Rows */}
            <div className="divide-y divide-gray-100">
              {homepageContent.compareNuvvyCare.rows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1.2fr] gap-4 px-4 py-4">
                  {/* What matters column */}
                  <div className="text-sm text-gray-900 leading-relaxed flex items-center">
                    {row.label}
                  </div>

                  {/* Regular Gardener column */}
                  <div className="flex items-center gap-2">
                    {row.regular.type === "check" && (
                      <Check className="w-5 h-5 flex-shrink-0 text-emerald-600" strokeWidth={2.5} />
                    )}
                    {row.regular.type === "warning" && (
                      <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500" strokeWidth={2.5} />
                    )}
                    {row.regular.type === "cross" && (
                      <X className="w-5 h-5 flex-shrink-0 text-red-500" strokeWidth={2.5} />
                    )}
                    <span className="text-sm text-gray-700 leading-relaxed">{row.regular.text}</span>
                  </div>

                  {/* Nuvvy Garden Care column */}
                  <div className="flex items-center gap-2">
                    {row.nuvvy.type === "check" && (
                      <Check className="w-5 h-5 flex-shrink-0 text-emerald-600" strokeWidth={2.5} />
                    )}
                    {row.nuvvy.type === "warning" && (
                      <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500" strokeWidth={2.5} />
                    )}
                    {row.nuvvy.type === "cross" && (
                      <X className="w-5 h-5 flex-shrink-0 text-red-500" strokeWidth={2.5} />
                    )}
                    <span className="text-sm text-gray-700 leading-relaxed">{row.nuvvy.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}


      {/* 5. PROOF & SOCIAL PROOF */}
      <section className="py-12 bg-gray-50">
        <div className="space-y-10">
          {/* Headlines */}
          <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-3">
              Loved by customers across Whitefield, Bangalore
            </h2>
            <p className="text-lg text-gray-600">
              Real balconies. Real plants. Cared for by the Nuvvy team.
            </p>
          </div>

          {/* Transformation Gallery */}
          <div className="columns-2 md:columns-3 gap-3 md:gap-4">
            {[
              "/images/before-after/image-1.png",
              "/images/before-after/image-2.jpeg",
              "/images/before-after/image-3.jpeg",
              "/images/before-after/image-4.jpeg",
              "/images/before-after/image-5.png",
              "/images/before-after/image-6.jpeg",
            ].map((imagePath, idx) => (
              <div
                key={idx}
                className="break-inside-avoid mb-4 md:mb-6"
              >
                <div
                  className="relative w-full rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
                  onClick={() => setLightboxImage(imagePath)}
                >
                  <img
                    src={imagePath}
                    alt={`Transformation ${idx + 1}`}
                    className="w-full h-auto"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Society Social Proof Strip */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-500">
              Balconies we care for in Whitefield
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {[
                { name: "Windmills of Your Mind", image: "/images/societies/windmills of your mind.jpg" },
                { name: "Prestige White Meadows", image: "/images/societies/prestige whitemeadows.jpeg" },
                { name: "Prestige Shantiniketan", image: "/images/societies/prestige shantiniketan.jpg" },
              ].map((society, idx) => (
                <div key={idx} className="flex-shrink-0 w-32 md:w-40">
                  <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-gray-100 mb-2">
                    <Image
                      src={society.image}
                      alt={society.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 128px, 160px"
                      unoptimized
                    />
                  </div>
                  <p className="text-sm text-gray-700 text-center leading-tight">
                    {society.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Lightbox */}
        {lightboxImage && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            <div 
              className="relative max-w-7xl max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={lightboxImage}
                alt="Full size view"
                width={1200}
                height={800}
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
                unoptimized
              />
              <button
                onClick={() => setLightboxImage(null)}
                className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 6. PRICING */}
      <SimplePricing />

      {/* 7. EXPERT-LED PLANT SELECTION HERO ROTATOR (full-width) */}
      <HeroCarousel heroes={homepageContent.expertLedPlantSelection.heroes} />

      {/* HOW NUVVY SETS UP YOUR BALCONY */}
      <section className="py-8 bg-white">
        <div className="mb-6 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-2">
            How Nuvvy sets up your balcony
          </h2>
          <p className="text-sm text-gray-600">
            End-to-end, horticulturist-led plant selection and setup.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-0 text-left">
          {/* Step 01 */}
          <div className="pb-4 border-b border-gray-200">
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-400 font-mono flex-shrink-0 pt-1">01</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h3 className="text-base font-semibold text-gray-900">Explore the catalog</h3>
                  <LayoutGrid className="w-4 h-4 text-blue-500 flex-shrink-0" strokeWidth={2} />
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Choose from 150+ curated indoor and balcony plants for Indian homes.
                </p>
              </div>
            </div>
          </div>

          {/* Step 02 */}
          <div className="py-4 border-b border-gray-200">
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-400 font-mono flex-shrink-0 pt-1">02</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h3 className="text-base font-semibold text-gray-900">Horticulturist shortlisting</h3>
                  <UserCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" strokeWidth={2} />
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Plants selected based on your balcony's light, heat, wind, and space.
                </p>
              </div>
            </div>
          </div>

          {/* Step 03 */}
          <div className="py-4 border-b border-gray-200">
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-400 font-mono flex-shrink-0 pt-1">03</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h3 className="text-base font-semibold text-gray-900">Trusted local sourcing</h3>
                  <MapPin className="w-4 h-4 text-amber-500 flex-shrink-0" strokeWidth={2} />
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Procured from trusted Bangalore nurseries at competitive pricing.
                </p>
              </div>
            </div>
          </div>

          {/* Step 04 */}
          <div className="py-4 border-b border-gray-200">
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-400 font-mono flex-shrink-0 pt-1">04</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h3 className="text-base font-semibold text-gray-900">Proper potting & setup</h3>
                  <Flower2 className="w-4 h-4 text-green-600 flex-shrink-0" strokeWidth={2} />
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Each plant is potted with the right soil mix and container.
                </p>
              </div>
            </div>
          </div>

          {/* Step 05 */}
          <div className="pt-4">
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-400 font-mono flex-shrink-0 pt-1">05</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h3 className="text-base font-semibold text-gray-900">Placement + ongoing care</h3>
                  <RefreshCcw className="w-4 h-4 text-teal-500 flex-shrink-0" strokeWidth={2} />
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Placed beautifully — and then cared for by Nuvvy's team.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Trust connector */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-700 leading-relaxed">
            Unlike marketplaces, we don't disappear after delivery. The same team that selects your plants also cares for them.
          </p>
        </div>

        {/* Optional CTA */}
        <div className="mt-5">
          <a
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("I'd like help choosing plants for my balcony")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            Get help choosing plants for your balcony
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* 8. EXPLORE NUVVY CATALOG */}
      <section className="py-8 bg-gray-50">
        <div className="mb-5 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-2">
            {homepageContent.mostPopularPlants.title}
          </h2>
          <p className="text-sm text-gray-600">
            Curated plants that work well with Nuvvy care.
          </p>
        </div>

        {/* Horizontal scroll carousel */}
        <div className="overflow-x-auto pb-4 -mx-4 lg:-mx-6 px-4 lg:px-6">
          <div className="flex gap-3 min-w-max">
            {popularPlants.length > 0 ? (
              popularPlants.map((plant) => {
                const imageUrl = plant.image_storage_url || plant.image_url || plant.thumbnail_storage_url || plant.thumbnail_url || undefined;
                const catalogId = plant.airtable_id || plant.id;
                
                return (
                  <Link key={plant.id} href={`/plantcatalog/${catalogId}`}>
                    <div className="flex-shrink-0 w-48">
                      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
                        <div className="relative h-40 bg-gray-200">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={plant.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200" />
                          )}
                        </div>
                        <div className="p-3">
                          <h3 className="text-sm font-semibold text-gray-900 mb-2 leading-tight">{plant.name}</h3>
                          <div className="space-y-1">
                            {plant.category && (
                              <div className="flex items-center gap-2">
                                <Leaf className="w-3.5 h-3.5 text-green-600 flex-shrink-0" strokeWidth={2} />
                                <span className="text-xs text-gray-700">{plant.category}</span>
                              </div>
                            )}
                            {plant.watering_requirement && (
                              <div className="flex items-center gap-2">
                                <Droplet className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" strokeWidth={2} />
                                <span className="text-xs text-gray-700">{plant.watering_requirement}</span>
                              </div>
                            )}
                            {plant.price_band && (
                              <div className="flex items-center gap-2">
                                <IndianRupee className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" strokeWidth={2} />
                                <span className="text-xs text-gray-700">{plant.price_band}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="text-gray-500 text-sm">No plants available</div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Link
            href="/plantcatalog"
            className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-gray-200 border border-gray-300 text-gray-900 font-semibold hover:bg-gray-300 transition-colors shadow-sm"
          >
            Explore full plant catalog
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* 9. FINAL CTA (CTA 3) */}
      <section className="py-12 bg-gradient-to-br from-green-50 to-gray-50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-3">
            Ready to give your plants expert care?
          </h2>
          <p className="text-gray-600 mb-6 text-lg">
            Direct reply from a horticulture expert
          </p>
          <a
            href={getWhatsAppLink(WHATSAPP_MESSAGES.generalChat)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold px-10 py-4 rounded-lg text-lg transition-colors shadow-lg"
          >
            Chat with Nuvvy team on WhatsApp
          </a>
        </div>
      </section>
      </div>
    </main>
  );
}
