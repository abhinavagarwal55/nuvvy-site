"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
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
        <Image
          src={plant.imageUrl || "/images/plant-placeholder.svg"}
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
            {plant.airPurifier === "Yes" && (
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

          {/* Care Basics */}
          <div>
            <h2 className="text-xl font-display font-semibold text-green-dark mb-4">
              Care Basics
            </h2>
            <div className="space-y-4">
              {plant.wateringRequirement && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Watering Requirement</h3>
                  <p className="text-gray-600">{plant.wateringRequirement}</p>
                </div>
              )}
              {plant.soilMix && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Soil Mix</h3>
                  <p className="text-gray-600">{plant.soilMix}</p>
                </div>
              )}
              {plant.fertilizationRequirement && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Fertilization Requirement</h3>
                  <p className="text-gray-600">{plant.fertilizationRequirement}</p>
                </div>
              )}
              {!plant.wateringRequirement && !plant.soilMix && !plant.fertilizationRequirement && (
                <p className="text-gray-500 italic">Care details coming soon.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
