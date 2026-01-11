"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import PlantImage from "@/components/PlantImage";
import { getCatalogStore, type PlantListItem, type PlantCategory, type AirPurifier } from "@/lib/catalog";

// Force dynamic rendering to always fetch latest Supabase data
export const dynamic = "force-dynamic";

export default function PlantCatalogPage() {
  const [plants, setPlants] = useState<PlantListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PlantCategory | "All">("All");
  const [selectedAirPurifier, setSelectedAirPurifier] = useState<AirPurifier | "All">("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPlants() {
      const store = getCatalogStore();
      const allPlants = await store.listPlants();
      setPlants(allPlants);
      setLoading(false);
    }
    loadPlants();
  }, []);

  // Client-side filtering
  const filteredPlants = useMemo(() => {
    return plants.filter((plant) => {
      const matchesSearch = searchQuery === "" || 
        plant.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || plant.category === selectedCategory;
      const matchesAirPurifier = 
        selectedAirPurifier === "All" || 
        (selectedAirPurifier === "Yes" && plant.airPurifier === "Yes");
      
      return matchesSearch && matchesCategory && matchesAirPurifier;
    });
  }, [plants, searchQuery, selectedCategory, selectedAirPurifier]);

  const categories: PlantCategory[] = [
    "Indoor plant",
    "Flowering",
    "Creepers",
    "Aromatic",
    "Fruit Plants",
    "Vegetables"
  ];

  return (
    <main className="bg-cream min-h-screen">
      {/* Header Section */}
      <section className="py-12 bg-white border-b border-gray-200">
        <div className="container mx-auto px-6 max-w-6xl">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-green-dark mb-2">
            Plant Catalog
          </h1>
          <p className="text-lg text-gray-600">
            Curated for Bangalore balconies
          </p>
        </div>
      </section>

      {/* Search and Filters Section */}
      <section className="py-4 bg-white border-b border-gray-200 sticky top-[73px] z-40">
        <div className="container mx-auto px-6 max-w-6xl">
          {/* Search Input */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search plants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-green focus:border-transparent"
            />
          </div>

          {/* Filter Chips */}
          <div className="space-y-3">
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <div className="flex gap-2 overflow-x-auto whitespace-nowrap -mx-6 px-6 scrollbar-hide flex-nowrap" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                <button
                  onClick={() => setSelectedCategory("All")}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === "All"
                      ? "bg-green text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedCategory === cat
                        ? "bg-green text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Air Purifier Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Air Purifier</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedAirPurifier("All")}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedAirPurifier === "All"
                      ? "bg-green text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedAirPurifier("Yes")}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedAirPurifier === "Yes"
                      ? "bg-green text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Plant Grid Section */}
      <section className="pt-6 pb-12 bg-cream">
        <div className="container mx-auto px-6 max-w-6xl">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Loading plants...</p>
            </div>
          ) : filteredPlants.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No plants found matching your filters.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Showing {filteredPlants.length} {filteredPlants.length === 1 ? "plant" : "plants"}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredPlants.map((plant) => (
                  <Link
                    key={plant.id}
                    href={`/plantcatalog/${plant.id}`}
                    className="group block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow border border-gray-200"
                  >
                    <div className="aspect-square relative bg-gray-100">
                      <PlantImage
                        src={plant.thumbnailUrl}
                        alt={plant.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <h3 className="font-semibold text-green-dark text-lg">{plant.name}</h3>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-block bg-mist text-green-dark px-2 py-1 rounded-full text-xs font-medium">
                          {plant.category}
                        </span>
                        <span className="inline-block bg-yellow/30 text-green-dark px-2 py-1 rounded-full text-xs font-medium">
                          {plant.light}
                        </span>
                        {plant.airPurifier === "Yes" && (
                          <span className="inline-block bg-green-50 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                            Air Purifier
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
