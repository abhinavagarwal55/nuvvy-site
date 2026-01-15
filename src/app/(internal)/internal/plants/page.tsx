"use client";

import { useState, useEffect, useCallback } from "react";

interface Plant {
  id: string;
  name: string;
  category?: string;
  light?: string;
  watering_requirement?: string;
  can_be_procured?: boolean;
  updated_at?: string;
  thumbnail_url?: string;
  thumbnail_storage_url?: string;
  image_url?: string;
  image_storage_url?: string;
}

interface PlantsResponse {
  data: Plant[] | null;
  error: string | null;
}

export default function PlantsPage() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [limit, setLimit] = useState(50);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setLimit(50); // Reset limit when search changes
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch plants
  const fetchPlants = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(debouncedQuery && { q: debouncedQuery }),
        ...(publishedOnly && { publishedOnly: "true" }),
      });

      const response = await fetch(`/api/internal/plants?${params}`);
      const json: PlantsResponse = await response.json();

      if (!response.ok || json.error) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }

      setPlants(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch plants");
      setPlants([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, publishedOnly, limit]);

  useEffect(() => {
    fetchPlants();
  }, [fetchPlants]);

  const handleLoadMore = () => {
    setLimit((prev) => Math.min(prev + 50, 200));
  };

  const getThumbnailUrl = (plant: Plant): string | undefined => {
    return (
      plant.thumbnail_storage_url ||
      plant.thumbnail_url ||
      plant.image_storage_url ||
      plant.image_url
    );
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "-";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Plants</h1>
        <p className="text-sm text-gray-600 mt-1">Manage and view all plants</p>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              id="search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or scientific name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Published Only Toggle */}
          <div className="flex items-end">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={publishedOnly}
                onChange={(e) => {
                  setPublishedOnly(e.target.checked);
                  setLimit(50); // Reset limit when filter changes
                }}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Published only</span>
            </label>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && plants.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading plants...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error}</p>
        </div>
      )}

      {/* Plants Table */}
      {!loading && !error && (
        <>
          {plants.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500">No plants found</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Thumbnail
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Light
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Watering
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Published
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Updated
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {plants.map((plant) => {
                        const thumbnailUrl = getThumbnailUrl(plant);
                        return (
                          <tr key={plant.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              {thumbnailUrl ? (
                                <img
                                  src={thumbnailUrl}
                                  alt={plant.name}
                                  className="h-12 w-12 object-cover rounded"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="h-12 w-12 bg-gray-200 rounded flex items-center justify-center">
                                  <span className="text-xs text-gray-400">No image</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{plant.name}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{plant.category || "-"}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-500">{plant.light || "-"}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm text-gray-500">
                                {plant.watering_requirement || "-"}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  plant.can_be_procured
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {plant.can_be_procured ? "Yes" : "No"}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm text-gray-500">
                                {formatDate(plant.updated_at)}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Load More Button */}
              {limit < 200 && plants.length >= limit && (
                <div className="text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Loading..." : "Load More"}
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    Showing {plants.length} plants (max 200)
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
