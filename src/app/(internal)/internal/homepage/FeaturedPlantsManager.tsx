"use client";

import { useState, useEffect } from "react";

interface Plant {
  id: string;
  name: string;
  thumbnailUrl?: string;
}

const MAX_PLANTS = 20;

export default function FeaturedPlantsManager() {
  const [plantIds, setPlantIds] = useState<string[]>([]);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [plantSearchQuery, setPlantSearchQuery] = useState("");
  const [loadingPlants, setLoadingPlants] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [replacingPlantId, setReplacingPlantId] = useState<string | null>(null);

  // Load featured plants on mount
  useEffect(() => {
    const loadFeaturedPlants = async () => {
      try {
        const apiUrl = typeof window !== "undefined" 
          ? `${window.location.origin}/api/internal/homepage`
          : "/api/internal/homepage";
        
        const response = await fetch(apiUrl);
        const result = await response.json();

        if (response.ok && result.data?.plantIds) {
          setPlantIds(result.data.plantIds);
        }
      } catch (err) {
        console.error("Error loading featured plants:", err);
      }
    };

    loadFeaturedPlants();
  }, []);

  // Load all plants for search
  useEffect(() => {
    const loadAllPlants = async () => {
      setLoadingPlants(true);
      try {
        const response = await fetch("/api/internal/plants?limit=10000&published=all&sort=name&dir=asc");
        const result = await response.json();
        
        if (result.data && Array.isArray(result.data)) {
          // Extract id, name, and thumbnail
          const plants = result.data.map((plant: any) => ({
            id: plant.id,
            name: plant.name || "Unnamed Plant",
            thumbnailUrl: plant.thumbnail_storage_url || plant.thumbnail_url || plant.image_storage_url || plant.image_url || undefined,
          }));
          setAllPlants(plants);
        }
      } catch (err) {
        console.error("Failed to fetch plants:", err);
      } finally {
        setLoadingPlants(false);
      }
    };

    loadAllPlants();
  }, []);

  // Get selected plants with full data for display
  const selectedPlants = plantIds
    .map((id) => {
      const plant = allPlants.find((p) => p.id === id);
      return plant ? { id, name: plant.name, thumbnailUrl: plant.thumbnailUrl } : null;
    })
    .filter((p): p is { id: string; name: string; thumbnailUrl: string | undefined } => p !== null);

  // Filter plants by search query
  const filteredPlants = allPlants.filter((plant) =>
    plant.name.toLowerCase().includes(plantSearchQuery.toLowerCase())
  );

  // Filter out already-selected plants from search results
  const availableSearchResults = filteredPlants.filter(
    (plant) => !plantIds.includes(plant.id)
  );

  const handleAddOrReplacePlant = (plantId: string, replaceId?: string) => {
    if (replaceId) {
      // Replace existing plant
      const newPlantIds = plantIds.map((id) =>
        id === replaceId ? plantId : id
      );
      setPlantIds(newPlantIds);
      setReplacingPlantId(null);
    } else if (plantIds.length < MAX_PLANTS) {
      // Add new plant if under limit
      if (!plantIds.includes(plantId)) {
        setPlantIds([...plantIds, plantId]);
      }
    } else {
      // At max capacity - enable replace mode
      setReplacingPlantId(plantId);
    }
    setPlantSearchQuery(""); // Clear search after adding/replacing
  };

  const handleRemovePlant = (plantId: string) => {
    setPlantIds(plantIds.filter((id) => id !== plantId));
    // Clear replace mode if the removed plant was being replaced
    if (replacingPlantId) {
      setReplacingPlantId(null);
    }
  };

  const handleCancelReplace = () => {
    setReplacingPlantId(null);
    setPlantSearchQuery("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const apiUrl = typeof window !== "undefined" 
        ? `${window.location.origin}/api/internal/homepage`
        : "/api/internal/homepage";
      
      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantIds }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to save featured plants");
      }

      setSuccess(true);
      setSaving(false);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Save Button */}
      <div className="flex items-center justify-between bg-white rounded-lg p-4 shadow-sm">
        {(success || error) && (
          <div>
            {success && (
              <p className="text-green-600 font-medium">✓ Saved successfully</p>
            )}
            {error && (
              <p className="text-red-600 font-medium">✗ {error}</p>
            )}
          </div>
        )}
        {!success && !error && <div />}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? "Saving..." : "Save Featured Plants"}
          </button>
        </div>
      </div>

      {/* Most Popular Plants Section */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Featured Plants</h2>
          <p className="text-sm text-gray-600 mb-6">
            Select up to {MAX_PLANTS} plants to feature on the homepage carousel. Changes are saved immediately.
          </p>

          <div className="space-y-4">
            {/* Selected Plants Grid */}
            {selectedPlants.length > 0 ? (
              <div className="mb-4">
                {replacingPlantId && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800 mb-2">Replace which plant?</p>
                    <button
                      type="button"
                      onClick={handleCancelReplace}
                      className="text-xs text-amber-700 hover:text-amber-900 underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {selectedPlants.map((plant) => (
                    <div
                      key={plant.id}
                      className={`relative border rounded-lg overflow-hidden ${
                        replacingPlantId
                          ? "border-amber-400 bg-amber-50 cursor-pointer hover:border-amber-500"
                          : "border-gray-200 bg-white"
                      }`}
                      onClick={() => {
                        if (replacingPlantId) {
                          handleAddOrReplacePlant(replacingPlantId, plant.id);
                        }
                      }}
                    >
                      {/* Plant Image */}
                      <div className="aspect-square bg-gray-100 relative">
                        {plant.thumbnailUrl ? (
                          <img
                            src={plant.thumbnailUrl}
                            alt={plant.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            No image
                          </div>
                        )}
                      </div>
                      
                      {/* Plant Name */}
                      <div className="p-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{plant.name}</p>
                      </div>
                      
                      {/* Remove Button */}
                      {!replacingPlantId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePlant(plant.id);
                          }}
                          className="absolute top-2 right-2 w-6 h-6 bg-white/90 hover:bg-white border border-gray-300 rounded-full flex items-center justify-center text-gray-600 hover:text-gray-900 text-xs font-semibold shadow-sm"
                          aria-label={`Remove ${plant.name}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-4 italic">
                Search and add plants to feature on the homepage.
              </p>
            )}

            {/* Search Input */}
            <div className="mb-3">
              <input
                type="text"
                value={plantSearchQuery}
                onChange={(e) => setPlantSearchQuery(e.target.value)}
                placeholder="Search plants..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {/* Search Results */}
            {plantSearchQuery && availableSearchResults.length > 0 && (
              <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                {availableSearchResults.slice(0, 20).map((plant) => (
                  <div
                    key={plant.id}
                    className="px-3 py-2 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-b-0 cursor-pointer"
                    onClick={() => handleAddOrReplacePlant(plant.id)}
                  >
                    {/* Plant Thumbnail */}
                    <div className="w-12 h-12 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                      {plant.thumbnailUrl ? (
                        <img
                          src={plant.thumbnailUrl}
                          alt={plant.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                          —
                        </div>
                      )}
                    </div>
                    
                    {/* Plant Name */}
                    <span className="text-sm text-gray-700 flex-1">{plant.name}</span>
                    
                    {/* Add/Replace Indicator */}
                    <span className="text-xs text-gray-500">
                      {plantIds.length >= MAX_PLANTS ? "Replace" : "Add"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {plantSearchQuery && availableSearchResults.length === 0 && (
              <p className="text-sm text-gray-500">No plants found or all matching plants are already selected.</p>
            )}

            {loadingPlants && (
              <p className="text-xs text-gray-500 mt-2">Loading plants...</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
