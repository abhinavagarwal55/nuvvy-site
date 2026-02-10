"use client";

import { useState, useEffect } from "react";
import { Check, X, AlertCircle, ArrowRight, LayoutGrid, UserCheck, MapPin, Flower2, RefreshCcw, Leaf, Droplet, IndianRupee } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import HeroCarousel from "@/components/HeroCarousel";
import ClassicHero from "@/components/heroes/ClassicHero";
import SnabbitHero from "@/components/heroes/SnabbitHero";
import SoundFamiliar from "@/components/sections/SoundFamiliar";
import SimplePricing from "@/components/sections/SimplePricing";
import type { HomepageContent } from "@/lib/schemas/homepage.schema";
import { WHATSAPP_MESSAGES, getWhatsAppLink } from "@/config/whatsapp";
import { HOMEPAGE_CONFIG } from "@/config/homepage";
import { publicImage } from "@/lib/publicAssets";

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

interface HomepagePreviewWrapperProps {
  homepageContent: HomepageContent;
  popularPlants: Plant[];
  whatsappNumber: string;
  whatsappMessage: string;
}

export default function HomepagePreviewWrapper({
  homepageContent,
  popularPlants,
  whatsappNumber,
  whatsappMessage,
}: HomepagePreviewWrapperProps) {
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [showStickyCTA, setShowStickyCTA] = useState(false);

  // Show sticky CTA only after scrolling past trust section
  useEffect(() => {
    const handleScroll = () => {
      // Show sticky CTA after scrolling past ~600px (after hero + trust sections)
      const scrollY = window.scrollY || window.pageYOffset;
      setShowStickyCTA(scrollY > 600);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Fixed Amber Banner */}
      <div className="sticky top-0 z-50 bg-amber-500 text-amber-900 px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="font-semibold text-sm md:text-base">
            Preview – Draft Content
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("desktop")}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === "desktop"
                  ? "bg-amber-600 text-white"
                  : "bg-amber-400/50 text-amber-900 hover:bg-amber-400"
              }`}
            >
              Desktop
            </button>
            <span className="text-amber-900">|</span>
            <button
              onClick={() => setViewMode("mobile")}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === "mobile"
                  ? "bg-amber-600 text-white"
                  : "bg-amber-400/50 text-amber-900 hover:bg-amber-400"
              }`}
            >
              Mobile
            </button>
          </div>
        </div>
      </div>

      {/* Homepage Content - Wrapped in viewport container */}
      <div
        className={
          viewMode === "mobile"
            ? "max-w-[390px] mx-auto border-x border-gray-200 bg-white shadow-lg"
            : "w-full"
        }
      >
        <main className="min-h-screen bg-white">
          {/* Floating WhatsApp CTA - Fixed bottom-right (CTA 3) */}
          {showStickyCTA && (
            <a
              href={getWhatsAppLink(WHATSAPP_MESSAGES.generalChat)}
              target="_blank"
              rel="noopener noreferrer"
              className="fixed bottom-6 right-6 z-50 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-full p-4 shadow-lg transition-all hover:scale-110"
              aria-label="Contact on WhatsApp"
            >
              <svg
                className="w-6 h-6"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
            </a>
          )}

          {/* 1. HERO SECTION - Toggle between classic and snabbit variants */}
          {HOMEPAGE_CONFIG.heroVariant === "classic" ? (
            <ClassicHero heroes={homepageContent.heroSection.heroes} />
          ) : (
            <SnabbitHero />
          )}

          {/* Sound Familiar Section - Preview Only */}
          <SoundFamiliar />

          {/* Centralized width container */}
          <div className={viewMode === "mobile" ? "px-4" : "max-w-[640px] mx-auto px-6"}>

          {/* 2. INTRODUCING NUVVY - Preview Only */}
          <section className="bg-white pt-6 pb-12">
            <div className="space-y-8">
              {/* Heading */}
              <div className="text-center">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[#1F3D2B] leading-tight mb-3">
                  Meet Nuvvy
                </h2>
              </div>

              {/* Main Image */}
              <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 mb-8">
                <Image
                  src={publicImage("/images/Introducing_Nuvvy_Horticuturist_Image.png")}
                  alt="Introducing Nuvvy"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 100vw"
                  unoptimized
                />
              </div>

              {/* Bullet Points */}
              <div className="space-y-4 text-left mb-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-green-600" />
                  </div>
                  <p className="text-base text-gray-700 leading-relaxed">
                    <span className="font-semibold">Horticulturist-led plant care</span> so your garden stays healthy without guesswork
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-green-600" />
                  </div>
                  <p className="text-base text-gray-700 leading-relaxed">
                    <span className="font-semibold">Right plants, right pots</span> chosen and installed for your balcony conditions
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-green-600" />
                  </div>
                  <p className="text-base text-gray-700 leading-relaxed">
                    <span className="font-semibold">All-inclusive care</span> with pest control and fertilization already covered
                  </p>
                </div>
              </div>

              {/* Pricing Line */}
              <p className="text-lg font-semibold text-gray-900 mb-6 text-center">
                Garden care plans starting at ₹799/month
              </p>

              {/* CTA 1 - Introducing Nuvvy */}
              <div className="text-center">
                <a
                  href={getWhatsAppLink(WHATSAPP_MESSAGES.balconyAssessment)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-lg"
                >
                  Book free 30 mins consultation with Horticulturist about your Balcony
                </a>
                <p className="text-xs text-gray-500 mt-2">No commitment</p>
              </div>
            </div>
          </section>

          {/* 3. COMPARE NUVVY CARE - Custom grid layout */}
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

          {/* 4. NUVVY CARE VISIT - 5 steps with numbers overlaid on images */}
          <section className="py-8 bg-white">
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-semibold text-gray-900">
                {homepageContent.nuvvyCareVisit.title}
              </h2>
            </div>
            <div className="space-y-5 text-left">
                {homepageContent.nuvvyCareVisit.steps.map((step, idx) => {
                  const stepNumberFormatted = step.stepNumber.toString().padStart(2, "0");
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-4 p-5 bg-gray-50 rounded-xl border border-gray-100"
                    >
                      {/* Thumbnail image with overlaid step number */}
                      <div className="relative flex-shrink-0">
                        <img
                          src={step.imageUrl}
                          alt={step.title}
                          className="rounded-lg object-cover"
                          style={{ width: "72px", height: "72px" }}
                        />
                        {/* Step number badge overlay */}
                        <div className="absolute top-1 left-1 bg-black/80 backdrop-blur-sm rounded-full w-6 h-6 flex items-center justify-center">
                          <span className="text-[10px] font-semibold text-white leading-none">{stepNumberFormatted}</span>
                        </div>
                      </div>
                      
                      {/* Text content */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 mb-1.5">{step.title}</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>

          {/* 5. PROOF & SOCIAL PROOF - Preview Only */}
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
                ].map((imagePath, idx) => {
                  const imageUrl = publicImage(imagePath);
                  return (
                  <div
                    key={idx}
                    className="break-inside-avoid mb-4 md:mb-6"
                  >
                    <div
                      className="relative w-full rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
                      onClick={() => setLightboxImage(imageUrl)}
                    >
                      <img
                        src={imageUrl}
                        alt={`Transformation ${idx + 1}`}
                        className="w-full h-auto"
                        loading="lazy"
                      />
                    </div>
                  </div>
                  );
                })}
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
                          src={publicImage(society.image)}
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
                Explore Nuvvy catalog
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
                      
                      // Build attributes array
                      const attributes = [];
                      if (plant.category) {
                        attributes.push(plant.category);
                      }
                      if (plant.watering_requirement) {
                        attributes.push(plant.watering_requirement);
                      }
                      if (plant.price_band) {
                        attributes.push(plant.price_band);
                      }
                      
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
      </div>
    </div>
  );
}
