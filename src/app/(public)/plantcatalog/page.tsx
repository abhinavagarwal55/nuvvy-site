"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import PlantImage from "@/components/PlantImage";
import { getCatalogStore, type PlantListItem, type PlantCategory, type AirPurifier } from "@/lib/catalog";

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
      
      // airPurifier is now always boolean
      const plantAirPurifierBool = Boolean(plant.airPurifier);
      
      const matchesAirPurifier = 
        selectedAirPurifier === "All" || 
        (selectedAirPurifier === "Yes" && plantAirPurifierBool) ||
        (selectedAirPurifier === "No" && !plantAirPurifierBool);
      
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
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="bg-[#F9FAFB] rounded-3xl border border-gray-200 p-6 md:p-10">
            {/* Breadcrumb */}
            <div className="mb-4 text-sm text-gray-500">
              <a href="/" className="hover:underline">Home</a>
              <span className="mx-2">/</span>
              <span className="text-gray-700">Plant Catalog</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-green-dark mt-4 mb-8">
              Plant Catalog
            </h1>
            <p className="text-lg text-gray-600 mb-6">
              Curated for Bangalore balconies
            </p>

            {/* Search and Filters Section */}
            <div className="py-4 mb-6">
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

            {/* Plant Grid Section */}
            <div className="pt-6">
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
                        className="group block rounded-xl border border-gray-100 bg-white transition-all duration-200 hover:shadow-lg hover:-translate-y-1 overflow-hidden"
                      >
                        <div className="aspect-square relative bg-gray-100">
                          <PlantImage
                            src={plant.thumbnailUrl}
                            alt={plant.name}
                            fill
                            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          />
                        </div>
                        <div className="p-4">
                          <h3 className="font-semibold text-green-dark text-lg">{plant.name}</h3>
                          {plant.price_band && (
                            <p className="text-base font-semibold text-green-800 mt-1">
                              {plant.price_band}
                            </p>
                          )}
                          <p className="text-sm text-gray-600 mt-1">
                            {plant.category} • {plant.light}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Section */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="bg-[#F9FAFB] rounded-3xl border border-gray-200 p-6 md:p-10 text-center">
            <h2 className="text-2xl font-semibold text-gray-900">
              Ready to get these plants set up?
            </h2>
            <a
              href="/#garden-care"
              className="inline-block mt-6 bg-green-500 text-white font-semibold py-4 px-8 rounded-full"
            >
              View Garden Care Plans
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
