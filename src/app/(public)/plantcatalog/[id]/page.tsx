"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PlantImageWithShare from "@/components/PlantImageWithShare";
import { useParams } from "next/navigation";
import { Droplet, Layers, FlaskConical, Leaf, Wind } from "lucide-react";
import { getCatalogStore, type PlantDetail } from "@/lib/catalog";

export default function PlantDetailPage() {
  const params = useParams();
  const plantId = params?.id as string;
  const [plant, setPlant] = useState<PlantDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPlant() {
      if (!plantId) return;
      const store = getCatalogStore();
      const plantData = await store.getPlantById(plantId);
      setPlant(plantData);
      setLoading(false);
    }
    loadPlant();
  }, [plantId]);

  if (loading) {
    return (
      <main className="bg-cream min-h-screen">
        <div className="container mx-auto px-6 py-12 max-w-4xl">
          <div className="text-center">
            <p className="text-gray-600">Loading plant details...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!plant) {
    return (
      <main className="bg-cream min-h-screen">
        <div className="container mx-auto px-6 py-12 max-w-4xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-green-dark mb-4">Plant Not Found</h1>
            <p className="text-gray-600 mb-6">The plant you&apos;re looking for doesn&apos;t exist.</p>
            <Link
              href="/plantcatalog"
              className="inline-block bg-green text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-dark transition-colors"
            >
              Back to Catalog
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-cream min-h-screen overflow-x-hidden">
      {/* Back Link - Above Hero */}
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-4">
        <Link
          href="/plantcatalog"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-green transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Catalog
        </Link>
      </div>

      {/* Hero Image - Full Bleed */}
      <div className="relative w-full h-[42vh] md:h-[520px] bg-gray-100">
        <PlantImageWithShare
          src={plant.imageUrl}
          alt={plant.name}
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
      </div>

      {/* White Content Card - Overlapping Hero */}
      <div className="max-w-3xl mx-auto px-4">
        <div className="relative -mt-10 rounded-3xl bg-white shadow-sm border border-gray-200 p-6 md:p-8">
          {/* Plant Name and Scientific Name */}
          <div className="mb-5">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-green-dark mb-2">
              {plant.name}
            </h1>
            {plant.scientificName && (
              <p className="text-base md:text-lg text-gray-500 italic">{plant.scientificName}</p>
            )}
          </div>

          {/* Category and Light Pills */}
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="inline-flex items-center bg-mist text-green-dark px-3 py-1.5 rounded-full text-sm font-medium">
              {plant.category}
            </span>
            <span className="inline-flex items-center bg-yellow/30 text-green-dark px-3 py-1.5 rounded-full text-sm font-medium">
              {plant.light}
            </span>
            {Boolean(plant.airPurifier) && (
              <span className="inline-flex items-center bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-xs font-medium">
                Air Purifier
              </span>
            )}
          </div>

          {/* Horticulturist Notes - Prominent */}
          {plant.horticulturistNotes && (
            <div className="mb-8">
              <h2 className="text-2xl font-display font-semibold text-green-dark mb-4">
                Horticulturist Notes
              </h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-line text-base" style={{ lineHeight: "1.7" }}>
                {plant.horticulturistNotes}
              </p>
            </div>
          )}

          {/* Care Essentials */}
          {(plant.wateringRequirement || plant.soilMix || plant.fertilizationRequirement || plant.airPurifier !== undefined) && (
            <div className="bg-gradient-to-b from-green-50/60 to-white border border-gray-200/60 rounded-2xl shadow-sm p-4">
              {/* Card Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-green-100 text-green-700 rounded-full p-2">
                  <Leaf className="w-4 h-4" />
                </div>
                <h2 className="font-semibold text-gray-900">Care Essentials</h2>
              </div>

              {/* Care Rows */}
              <div className="space-y-4">
                {plant.wateringRequirement && (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                      <Droplet className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 mb-0.5">Watering Requirement</h3>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{plant.wateringRequirement}</p>
                    </div>
                  </div>
                )}
                {plant.soilMix && (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 mb-0.5">Soil Mix</h3>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{plant.soilMix}</p>
                    </div>
                  </div>
                )}
                {plant.fertilizationRequirement && (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-violet-50 text-violet-600 rounded-full flex items-center justify-center">
                      <FlaskConical className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 mb-0.5">Fertilization Requirement</h3>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{plant.fertilizationRequirement}</p>
                    </div>
                  </div>
                )}
                {plant.airPurifier !== undefined && (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center">
                      <Wind className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 mb-0.5">Air Purifying</h3>
                      <p className="text-sm text-gray-700">
                        {plant.airPurifier === true ? "Yes" : "No"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
