import { Check, X, Calendar, Search, Sprout, Droplets, MessageSquare, AlertCircle, ArrowRight } from "lucide-react";
import { getHomepageContent } from "@/lib/homepage/getHomepageContent";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import Link from "next/link";
import HeroCarousel from "@/components/HeroCarousel";

async function getPlantsByIds(plantIds: string[]) {
  if (!plantIds || plantIds.length === 0) return [];

  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from("plants")
    .select("id, airtable_id, name, light, thumbnail_storage_url, thumbnail_url, image_storage_url, image_url")
    .in("id", plantIds)
    .eq("can_be_procured", true);

  if (error || !data) {
    console.error("Error fetching plants:", error);
    return [];
  }

  // Create a map for quick lookup
  const plantMap = new Map(data.map((p) => [p.id, p]));
  
  // Preserve order from plantIds and filter out missing plants
  return plantIds
    .map((id) => plantMap.get(id))
    .filter((plant): plant is NonNullable<typeof plant> => plant !== undefined);
}

export default async function GardenCareMockPage() {
  const whatsappNumber = "919876543210"; // Placeholder
  const whatsappMessage = encodeURIComponent("Hi, I'm interested in Nuvvy Garden Care");

  // Fetch homepage content from Supabase
  const homepageContent = await getHomepageContent("draft");

  // Fetch popular plants
  const popularPlants = await getPlantsByIds(homepageContent.mostPopularPlants.plantIds);

  return (
    <main className="min-h-screen bg-white">
      {/* Floating WhatsApp CTA - Fixed bottom-right */}
      <a
        href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
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

      {/* 1. HERO SECTION - With carousel navigation */}
      <HeroCarousel heroes={homepageContent.heroSection.heroes} />

      {/* 2. HORTICULTURIST-LED CARE */}
      <section className="relative overflow-visible bg-white pl-6 pr-0 min-h-[420px] flex items-center py-8">
        {/* Text Content - Left aligned, in front */}
        <div className="relative max-w-[58%] z-20 pr-4">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4 whitespace-nowrap">
            {homepageContent.horticulturistCare.title}
          </h2>
          
          <div className="space-y-5">
            {homepageContent.horticulturistCare.bullets.map((bullet, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                <p className="text-gray-700 text-base leading-loose">
                  <span className="font-semibold">{bullet.boldText}</span>
                  {bullet.restText}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Image - Right aligned, behind text, slightly left for better balance */}
        <div className="absolute right-[-16px] bottom-[-16px] w-[68vw] max-w-[320px] z-10 flex justify-end">
          {/* Container with white background to handle transparent PNG */}
          <div className="relative bg-white rounded-b-3xl overflow-hidden">
            <img
              src="/images/horticulturist.png"
              alt="Nuvvy horticulturist"
              className="w-full h-auto object-cover"
              style={{ aspectRatio: "3/4", display: "block" }}
            />
            {/* Soft fade at bottom edge */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/10 pointer-events-none" />
          </div>
        </div>
      </section>

      {/* 3. COMPARE NUVVY CARE - Custom grid layout */}
      <section className="py-8 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-6">
            {homepageContent.compareNuvvyCare.title}
          </h2>
          <div className="bg-white rounded-xl overflow-hidden shadow-sm">
            {/* Column Headers */}
            <div className="grid grid-cols-[1fr_1fr_1.2fr] gap-4 px-4 py-4 border-b border-gray-200 bg-gray-50">
              <div className="text-sm font-semibold text-gray-900 leading-snug">
                What
              </div>
              <div className="text-sm font-semibold text-gray-700 leading-snug">
                Regular Gardener
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
                      <Check className="w-5 h-5 flex-shrink-0" style={{ color: "#16a34a" }} strokeWidth={2.5} />
                    )}
                    {row.regular.type === "warning" && (
                      <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#eab308" }} strokeWidth={2.5} />
                    )}
                    {row.regular.type === "cross" && (
                      <X className="w-5 h-5 flex-shrink-0" style={{ color: "#ef4444" }} strokeWidth={2.5} />
                    )}
                    <span className="text-sm text-gray-700 leading-relaxed">{row.regular.text}</span>
                  </div>

                  {/* Nuvvy Garden Care column */}
                  <div className="flex items-center gap-2">
                    {row.nuvvy.type === "check" && (
                      <Check className="w-5 h-5 flex-shrink-0" style={{ color: "#16a34a" }} strokeWidth={2.5} />
                    )}
                    {row.nuvvy.type === "warning" && (
                      <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#eab308" }} strokeWidth={2.5} />
                    )}
                    {row.nuvvy.type === "cross" && (
                      <X className="w-5 h-5 flex-shrink-0" style={{ color: "#ef4444" }} strokeWidth={2.5} />
                    )}
                    <span className="text-sm text-gray-700 leading-relaxed">{row.nuvvy.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. NUVVY CARE VISIT - 5 steps with numbers overlaid on images */}
      <section className="py-8 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-2">
            {homepageContent.nuvvyCareVisit.title}
          </h2>
          <p className="text-sm text-gray-600 mb-6">What happens when we come over</p>
          <div className="space-y-5">
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
        </div>
      </section>

      {/* 5. SEE THE DIFFERENCE YOURSELF (PROOF) */}
      <section className="py-8 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-2">
            {homepageContent.seeTheDifference.title}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Real balconies. Real care. No filters.
          </p>
          
          {/* Masonry-style image grid - 2 columns, natural stacking */}
          <div className="columns-2 gap-3 mb-8">
            {homepageContent.seeTheDifference.images.map((image, idx) => (
              <div key={idx} className="break-inside-avoid mb-3">
                <div className="rounded-lg overflow-hidden">
                  <img
                    src={image.imageUrl}
                    alt={`Transformation ${idx + 1}`}
                    className="w-full h-auto object-contain"
                    loading="lazy"
                  />
                </div>
                {image.caption && (
                  <p className="text-xs text-gray-600 mt-2 px-1">{image.caption}</p>
                )}
              </div>
            ))}
          </div>
          
          <div className="text-center">
            <button className="text-green-600 font-medium text-sm hover:text-green-700 transition-colors">
              View more transformations →
            </button>
          </div>
        </div>
      </section>

      {/* 6. PRICING (BASED ON NUMBER OF POTS) */}
      <section className="py-8 px-6 bg-white">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-3">
            {homepageContent.pricing.title}
          </h2>
          <p className="text-gray-600 mb-6 text-lg">
            {homepageContent.pricing.description}
          </p>

          <div className="space-y-6 mb-8">
            {homepageContent.pricing.tiers.map((tier, idx) => {
              const isLastTier = idx === homepageContent.pricing.tiers.length - 1;
              const hasSecondaryPrice = tier.priceSecondary !== null;
              const hasSecondaryFrequency = tier.frequencySecondary !== null;

              return (
                <div
                  key={idx}
                  className={`${
                    isLastTier
                      ? "border-2 border-green-200 rounded-xl p-6 bg-green-50"
                      : "border border-gray-200 rounded-xl p-6 bg-gray-50"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{tier.label}</h3>
                      {hasSecondaryFrequency ? (
                        <div className="mt-1 space-y-1">
                          <p className="text-sm text-gray-600">
                            ₹{tier.pricePrimary.toLocaleString("en-IN")} {tier.frequencyPrimary}
                          </p>
                          {hasSecondaryPrice && (
                            <p className="text-sm text-gray-600">
                              OR ₹{tier.priceSecondary!.toLocaleString("en-IN")} {tier.frequencySecondary}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600 mt-1">{tier.frequencyPrimary}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-gray-900">
                        ₹{tier.pricePrimary.toLocaleString("en-IN")}
                      </div>
                      <div className="text-sm text-gray-500">per visit</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-sm text-gray-600 mb-8">
            Includes all inputs, pest control & horticulturist oversight
          </p>

          <a
            href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            Talk to us on WhatsApp for exact pricing
          </a>
        </div>
      </section>

      {/* 7. EXPERT-LED PLANT SELECTION HERO ROTATOR */}
      <HeroCarousel heroes={homepageContent.expertLedPlantSelection.heroes} />

      {/* 8. OUR MOST POPULAR PLANTS */}
      <section className="py-8 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-6">
            {homepageContent.mostPopularPlants.title}
          </h2>

          {/* Horizontal scroll carousel */}
          <div className="overflow-x-auto pb-4 -mx-6 px-6">
            <div className="flex gap-4 min-w-max">
              {popularPlants.length > 0 ? (
                popularPlants.map((plant) => {
                  const imageUrl = plant.image_storage_url || plant.image_url || plant.thumbnail_storage_url || plant.thumbnail_url || undefined;
                  const descriptor = plant.light || "Easy care";
                  // Use airtable_id for the catalog route if available, otherwise fall back to id
                  const catalogId = plant.airtable_id || plant.id;
                  
                  return (
                    <Link key={plant.id} href={`/plantcatalog/${catalogId}`}>
                      <div className="flex-shrink-0 w-56">
                        <div className="bg-white rounded-xl overflow-hidden shadow-sm">
                          <div className="relative h-48 bg-gray-200">
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
                          <div className="p-4">
                            <h3 className="font-semibold text-gray-900 mb-1">{plant.name}</h3>
                            <p className="text-sm text-gray-500">{descriptor}</p>
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

          <div className="mt-6">
            <a
              href="#"
              className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-gray-200 border border-gray-300 text-gray-900 font-semibold hover:bg-gray-300 transition-colors shadow-sm"
            >
              Explore full plant catalog
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* 9. SOCIAL PROOF */}
      <section className="py-8 px-6 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="space-y-6">
            <div>
              <p className="text-gray-600 text-lg">{homepageContent.socialProof.headline}</p>
            </div>
            <div>
              <p className="text-gray-600 text-lg">{homepageContent.socialProof.subtext}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 10. FINAL CTA */}
      <section className="py-12 px-6 bg-gradient-to-br from-green-50 to-gray-50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-3">
            Ready to give your plants expert care?
          </h2>
          <p className="text-gray-600 mb-6 text-lg">
            Direct reply from a horticulture expert
          </p>
          <a
            href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold px-10 py-4 rounded-lg text-lg transition-colors shadow-lg"
          >
            Start a conversation on WhatsApp
          </a>
        </div>
      </section>
    </main>
  );
}
