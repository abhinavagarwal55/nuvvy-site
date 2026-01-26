"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Helper to safely read JSON from response, handling HTML errors and empty bodies
async function safeReadJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text(); // always read once
  if (!res.ok) {
    // try parse json error; else show text snippet
    if (contentType.includes("application/json")) {
      try { return { ok: false, body: JSON.parse(text) }; } catch {}
    }
    return { ok: false, body: { error: text?.slice(0, 300) || `Request failed (${res.status})` } };
  }
  if (!text) return { ok: true, body: null }; // handles 204/empty
  if (contentType.includes("application/json")) {
    try { return { ok: true, body: JSON.parse(text) }; } catch {
      return { ok: false, body: { error: "Invalid JSON returned from server" } };
    }
  }
  return { ok: false, body: { error: "Server returned non-JSON response" } };
}

interface PlantDetail {
  id: string;
  name: string;
  scientific_name?: string | null;
  category?: string | null;
  light?: string | null;
  category_id?: string | null;
  light_id?: string | null;
  watering_requirement?: string | null;
  fertilization_requirement?: string | null;
  soil_mix?: string | null;
  toxicity?: string | null;
  lifespan?: string | null;
  horticulturist_notes?: string | null;
  can_be_procured?: boolean | null;
  price_band?: string | null;
  image_storage_url?: string | null;
  image_url?: string | null;
  thumbnail_storage_url?: string | null;
  thumbnail_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface LightCondition {
  id: string;
  name: string;
}

export default function PlantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [plant, setPlant] = useState<PlantDetail | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [lightCondition, setLightCondition] = useState<LightCondition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plantId, setPlantId] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleEdit = () => {
    // Navigate to plants list page with edit query param
    router.push(`/internal/plants?edit=${plantId}`);
  };

  const handleDelete = async () => {
    if (!plant) return;

    const confirmed = window.confirm(
      `Delete plant "${plant.name}"? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/internal/plants/${plantId}`, {
        method: "DELETE",
      });

      const result = await safeReadJson(response);

      if (!result.ok) {
        throw new Error(result.body?.error || "Failed to delete plant");
      }

      // Success: navigate to list page with success query param
      router.push("/internal/plants?deleted=1");
    } catch (err) {
      console.error("Error deleting plant:", err);
      setDeleteError(err instanceof Error ? err.message : "Failed to delete plant");
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    async function loadPlantId() {
      const resolvedParams = await params;
      setPlantId(resolvedParams.id);
    }
    loadPlantId();
  }, [params]);

  useEffect(() => {
    if (!plantId) return;

    async function loadPlant() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/internal/plants/${plantId}`);
        const result = await safeReadJson(response);

        if (!result.ok || result.body?.error) {
          throw new Error(result.body?.error || `HTTP ${response.status}`);
        }

        const json = result.body as { data: PlantDetail; error: string | null };
        setPlant(json.data);

        // Load category and light names if IDs exist
        if (json.data.category_id) {
          const catResponse = await fetch("/api/internal/lookups/categories");
          const catResult = await safeReadJson(catResponse);
          if (catResult.ok && catResult.body?.data) {
            const found = catResult.body.data.find((c: Category) => c.id === json.data.category_id);
            if (found) setCategory(found);
          }
        }

        if (json.data.light_id) {
          const lightResponse = await fetch("/api/internal/lookups/light");
          const lightResult = await safeReadJson(lightResponse);
          if (lightResult.ok && lightResult.body?.data) {
            const found = lightResult.body.data.find((l: LightCondition) => l.id === json.data.light_id);
            if (found) setLightCondition(found);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load plant");
      } finally {
        setLoading(false);
      }
    }

    loadPlant();
  }, [plantId]);

  const getImageUrl = (plant: PlantDetail): string | undefined => {
    return (
      plant.image_storage_url ??
      plant.image_url ??
      plant.thumbnail_storage_url ??
      plant.thumbnail_url ??
      undefined
    );
  };

  const getThumbnailUrl = (plant: PlantDetail): string | undefined => {
    return (
      plant.thumbnail_storage_url ??
      plant.thumbnail_url ??
      plant.image_storage_url ??
      plant.image_url ??
      undefined
    );
  };

  const formatDate = (dateString?: string | null): string => {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "-";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Loading plant details...</p>
        </div>
      </div>
    );
  }

  if (error || !plant) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error || "Plant not found"}</p>
        </div>
        <Link
          href="/internal/plants"
          className="inline-block text-blue-600 hover:text-blue-800"
        >
          ← Back to Plants
        </Link>
      </div>
    );
  }

  const imageUrl = getImageUrl(plant);
  const thumbnailUrl = getThumbnailUrl(plant);
  const displayImageUrl = thumbnailUrl || imageUrl;

  return (
    <div className="space-y-4 md:space-y-6 px-4 md:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
          {/* Thumbnail Image */}
          <div className="flex-shrink-0 mx-auto md:mx-0">
            {displayImageUrl ? (
              <img
                src={displayImageUrl}
                alt={plant.name}
                className="w-full max-w-[140px] h-48 md:h-[140px] md:w-[140px] object-cover rounded-lg border border-gray-200"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.style.display = "none";
                  const placeholder = img.nextElementSibling as HTMLElement;
                  if (placeholder) placeholder.style.display = "flex";
                }}
              />
            ) : null}
            <div
              className={`w-full max-w-[140px] h-48 md:h-[140px] md:w-[140px] bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center ${
                displayImageUrl ? "hidden" : ""
              }`}
            >
              <span className="text-xs text-gray-400">No image</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <Link
              href="/internal/plants"
              className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block"
            >
              ← Back to Plants
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 break-words">{plant.name}</h1>
            {plant.scientific_name && (
              <p className="text-sm text-gray-600 italic mt-1 break-words">{plant.scientific_name}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 md:items-center md:gap-3">
          <button
            onClick={handleEdit}
            className="flex-1 md:flex-none px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 md:flex-none px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      {/* Delete Error Message */}
      {deleteError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {deleteError}</p>
        </div>
      )}

      {/* Plant Details - 2 Column Layout */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Plant Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <p className="text-sm text-gray-900 break-words">
                {category?.name || plant.category || "-"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Light Requirement
              </label>
              <p className="text-sm text-gray-900 break-words">
                {lightCondition?.name || plant.light || "-"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Toxicity
              </label>
              <p className="text-sm text-gray-900 break-words">{plant.toxicity || "-"}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lifespan
              </label>
              <p className="text-sm text-gray-900 break-words">{plant.lifespan || "-"}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Published
              </label>
              <span
                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  plant.can_be_procured
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {plant.can_be_procured ? "Yes" : "No"}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price Band
              </label>
              <p className="text-sm text-gray-900 break-words">{plant.price_band || "-"}</p>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Watering Requirement
              </label>
              <p className="text-sm text-gray-900 whitespace-pre-line break-words">
                {plant.watering_requirement || "-"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fertilization Requirement
              </label>
              <p className="text-sm text-gray-900 whitespace-pre-line break-words">
                {plant.fertilization_requirement || "-"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Soil Mix
              </label>
              <p className="text-sm text-gray-900 whitespace-pre-line break-words">
                {plant.soil_mix || "-"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Horticulturist Notes */}
      {plant.horticulturist_notes && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Horticulturist Notes
          </h2>
          <p className="text-sm text-gray-900 whitespace-pre-line break-words">
            {plant.horticulturist_notes}
          </p>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Metadata</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <label className="block text-gray-700 font-medium mb-1">Created</label>
            <p className="text-gray-900 break-words">{formatDate(plant.created_at)}</p>
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-1">Updated</label>
            <p className="text-gray-900 break-words">{formatDate(plant.updated_at)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
