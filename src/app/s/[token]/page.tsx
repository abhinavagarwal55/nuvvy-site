"use client";

import { useState, useEffect, use, useMemo } from "react";
import Image from "next/image";

interface Plant {
  id: string;
  name: string;
  scientific_name?: string | null;
  price_band?: string | null;
  light?: string | null;
  watering_requirement?: string | null;
  thumbnail_url?: string | null;
  thumbnail_storage_url?: string | null;
  image_url?: string | null;
  image_storage_url?: string | null;
}

interface VersionItem {
  id: string;
  plant_id: string;
  quantity: number | null;
  note: string | null;
  why_picked_for_balcony?: string | null;
  plant: Plant | null;
}

interface Version {
  id: string;
  version_number: number;
  status_at_time: string;
  created_at: string;
}

interface ShortlistData {
  version: Version;
  items: VersionItem[];
  customer_name?: string | null;
  shortlist_title?: string | null;
  shortlist_description?: string | null;
}

// Helper to safely read JSON from response (matches existing pattern)
async function safeReadJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!res.ok) {
    if (contentType.includes("application/json")) {
      try {
        return { ok: false, body: JSON.parse(text) };
      } catch {}
    }
    return { ok: false, body: { error: text?.slice(0, 300) || `Request failed (${res.status})` } };
  }
  if (!text) return { ok: true, body: null };
  if (contentType.includes("application/json")) {
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return { ok: false, body: { error: "Invalid JSON returned from server" } };
    }
  }
  return { ok: false, body: { error: "Server returned non-JSON response" } };
}

export default function PublicShortlistPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShortlistData | null>(null);
  const [items, setItems] = useState<Map<string, { quantity: number | null; note: string }>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expandedPlants, setExpandedPlants] = useState<Set<string>>(new Set());

  // Determine if page is editable based on version status
  const isEditable = data?.version.status_at_time === "SENT_TO_CUSTOMER";
  const isSubmitted = data?.version.status_at_time === "CUSTOMER_SUBMITTED";

  // Fetch shortlist data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/shortlists/public/${token}`);
        const result = await safeReadJson(response);

        if (!result.ok || result.body?.error) {
          throw new Error(result.body?.error || "Failed to load shortlist");
        }

        if (!result.body || !result.body.version || !result.body.items) {
          throw new Error("Invalid response format");
        }

        setData(result.body);

        // Initialize local state from version items
        // Preserve NULL quantities (recommended but not selected)
        const itemsMap = new Map<string, { quantity: number | null; note: string }>();
        result.body.items.forEach((item: VersionItem) => {
          // Explicitly handle null/undefined: null = recommended but not selected
          // Also handle 0 as null (invalid quantity)
          let qty: number | null = null;
          if (item.quantity !== undefined && item.quantity !== null && item.quantity > 0) {
            qty = item.quantity;
          }
          itemsMap.set(item.id, {
            quantity: qty,
            note: item.note || "",
          });
        });
        setItems(itemsMap);
      } catch (err) {
        console.error("Error fetching shortlist:", err);
        setError(err instanceof Error ? err.message : "Failed to load shortlist");
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchData();
    }
  }, [token]);

  // Get thumbnail URL for plant
  const getThumbnailUrl = (plant: Plant | null): string | null => {
    if (!plant) return null;
    return plant.thumbnail_storage_url || plant.thumbnail_url || plant.image_storage_url || plant.image_url || null;
  };

  // Parse price band to extract min/max
  const parsePriceBand = (priceBand: string | null | undefined): { min: number; max: number } | null => {
    if (!priceBand) return null;
    // Match patterns like: "INR 350-500", "₹350-500", "350-500", "350 – 500", "₹350 – ₹500", etc.
    // Extract all numbers and use first two as min/max
    const numbers = priceBand.match(/\d+/g);
    if (numbers && numbers.length >= 2) {
      const min = parseInt(numbers[0], 10);
      const max = parseInt(numbers[1], 10);
      if (min > 0 && max >= min) {
        return { min, max };
      }
    }
    return null;
  };

  // Memoized estimate calculation
  const estimate = useMemo(() => {
    if (!data || !data.items || data.items.length === 0) {
      return { min: 0, max: 0, midpoint: 0 };
    }

    let min = 0;
    let max = 0;

    data.items.forEach((item) => {
      const itemState = items.get(item.id);
      if (!itemState) return;

      // Only include items with quantity >= 1 (NULL is treated as 0)
      const qty = itemState.quantity ?? 0;
      if (qty <= 0) return;

      const priceBand = parsePriceBand(item.plant?.price_band);
      if (priceBand) {
        min += priceBand.min * qty;
        max += priceBand.max * qty;
      }
    });

    const midpoint = Math.round((min + max) / 2);
    return { min, max, midpoint };
  }, [data, items]);

  // Calculate item cost (for individual item display)
  const calculateItemCost = (item: VersionItem, quantity: number | null): { min: number; max: number } | null => {
    if (quantity === null || quantity <= 0) return null;
    const priceBand = parsePriceBand(item.plant?.price_band);
    if (!priceBand) return null;
    return {
      min: priceBand.min * quantity,
      max: priceBand.max * quantity,
    };
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return `₹${amount.toLocaleString("en-IN")}`;
  };

  // Update item quantity
  const updateQuantity = (itemId: string, quantity: number | null) => {
    if (!isEditable) return;
    if (quantity !== null && quantity < 1) return;

    setItems((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId) || { quantity: null, note: "" };
      newMap.set(itemId, { ...current, quantity });
      return newMap;
    });
  };

  // Add plant (set quantity from null to 1)
  const addPlant = (itemId: string) => {
    if (!isEditable) return;
    updateQuantity(itemId, 1);
  };

  // Increment quantity
  const incrementQuantity = (itemId: string) => {
    if (!isEditable) return;
    const current = items.get(itemId);
    const currentQty = current?.quantity;
    if (currentQty === null) {
      // If null, set to 1 (add plant)
      updateQuantity(itemId, 1);
    } else {
      updateQuantity(itemId, currentQty + 1);
    }
  };

  // Decrement quantity
  const decrementQuantity = (itemId: string) => {
    if (!isEditable) return;
    const current = items.get(itemId);
    const currentQty = current?.quantity;
    if (currentQty === null || currentQty <= 1) {
      // If 1 or less, set to null (remove from selection)
      updateQuantity(itemId, null);
    } else {
      updateQuantity(itemId, currentQty - 1);
    }
  };

  // Update item note
  const updateNote = (itemId: string, note: string) => {
    if (!isEditable) return;

    setItems((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId) || { quantity: null, note: "" };
      newMap.set(itemId, { ...current, note });
      return newMap;
    });
  };

  // Remove item
  const removeItem = (itemId: string) => {
    if (!isEditable) return;

    setItems((prev) => {
      const newMap = new Map(prev);
      newMap.delete(itemId);
      return newMap;
    });
  };

  // Toggle plant details expansion
  const togglePlantDetails = (itemId: string) => {
    setExpandedPlants((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Handle finalize
  const handleFinalize = async () => {
    // Defensive check: prevent submission if already submitted
    if (isSubmitted) {
      console.warn("Attempted to finalize an already-submitted shortlist");
      return;
    }

    if (!isEditable || !data) return;

    setIsSubmitting(true);

    try {
      // Build items array from current state
      // Only include items with quantity >= 1 (selected items)
      // Items with NULL quantity are "recommended but not selected" and should not be submitted
      const itemsToSubmit = Array.from(items.entries())
        .filter(([itemId, state]) => {
          // Only include items that still exist in the original data AND have quantity >= 1
          const existsInOriginal = data.items.some((item) => item.id === itemId);
          const hasQuantity = state.quantity !== null && state.quantity !== undefined && state.quantity >= 1;
          return existsInOriginal && hasQuantity;
        })
        .map(([itemId, state]) => {
          const originalItem = data.items.find((item) => item.id === itemId);
          return {
            plant_id: originalItem!.plant_id,
            quantity: state.quantity!,
            notes: state.note || null,
          };
        });

      if (itemsToSubmit.length === 0) {
        alert("Please select at least one plant (quantity >= 1) to proceed");
        setIsSubmitting(false);
        return;
      }

      const response = await fetch(`/api/shortlists/public/${token}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToSubmit }),
      });

      const result = await safeReadJson(response);

      if (!result.ok || result.body?.error) {
        throw new Error(result.body?.error || "Failed to submit shortlist");
      }

      // Success - show confirmation
      setSubmitted(true);
    } catch (err) {
      console.error("Error finalizing shortlist:", err);
      alert(err instanceof Error ? err.message : "Failed to submit shortlist");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading your shortlist...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    // Check if error is related to Supabase initialization
    const isServiceError = error?.includes("supabaseUrl") || error?.includes("temporarily unavailable");
    
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isServiceError ? "Service Unavailable" : "Shortlist Not Found"}
          </h1>
          <p className="text-gray-600">
            {isServiceError 
              ? "This link is temporarily unavailable. Please contact Nuvvy."
              : (error || "The shortlist you're looking for doesn't exist or is no longer available.")
            }
          </p>
        </div>
      </div>
    );
  }

  // Submitted confirmation state
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white rounded-lg border border-gray-200 p-8">
          <div className="mb-4">
            <svg className="mx-auto h-16 w-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Thanks!</h1>
          <p className="text-gray-600">We've received your shortlist.</p>
        </div>
      </div>
    );
  }

  const customerName = data.customer_name;
  const hasValidEstimate = estimate.min > 0 || estimate.max > 0;
  const hasItems = data && data.items && data.items.length > 0 && Array.from(items.values()).some(item => item.quantity !== null && item.quantity > 0);
  
  // Check if at least one plant has quantity >= 1 (selected for procurement)
  const hasSelectedPlants = Array.from(items.values()).some(item => item.quantity !== null && item.quantity !== undefined && item.quantity >= 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Personalized Hero Header */}
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            {customerName ? `${customerName}, here's your plant shortlist 🌿` : "Here's your plant shortlist 🌿"}
          </h1>
          <p className="text-base text-gray-600">
            Curated by your Nuvvy horticulturist for your space
          </p>
        </div>

        {/* Shortlist Title + Description */}
        {data.shortlist_title && (
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {data.shortlist_title}
            </h2>
            {data.shortlist_description && (
              <p className="text-base text-gray-600">
                {data.shortlist_description}
              </p>
            )}
          </div>
        )}

        {/* Above-the-fold CTA */}
        {isEditable && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900 text-center">
              Review your plants, adjust quantities if needed, and confirm to proceed.
            </p>
          </div>
        )}

        {/* Top Estimated Total */}
        <div className="min-h-[90px] mb-6">
          <div
            className={`transition-all duration-300 ease-out ${
              hasItems && hasValidEstimate
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            {hasItems && hasValidEstimate && (
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <span className="text-base font-semibold text-gray-900">Estimated total</span>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-2xl font-bold text-gray-900">
                      {formatCurrency(estimate.midpoint)}
                    </span>
                    <span className="text-xs text-gray-500">
                      Final price will vary between {formatCurrency(estimate.min)} – {formatCurrency(estimate.max)} based on nursery availability
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Read-only banner for submitted shortlists */}
        {isSubmitted && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-800 text-sm flex items-center gap-2">
              <span>✅</span>
              <span>Shortlist confirmed. Our team is reviewing this and will contact you shortly.</span>
            </p>
          </div>
        )}

        {/* Plant Items */}
        <div className="space-y-4 mb-6">
          {data.items
            .map((item) => {
              const itemState = items.get(item.id);
              // Use explicit null check: quantity = null means recommended but not selected
              // If itemState doesn't exist, default to null (recommended but not selected)
              const quantity = itemState?.quantity ?? (item.quantity ?? null);

              const itemCost = calculateItemCost(item, quantity);
              const thumbnailUrl = getThumbnailUrl(item.plant);

              return (
                <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Plant Image - Larger with rounded corners and shadow */}
                    {thumbnailUrl && (
                      <div className="flex-shrink-0">
                        <Image
                          src={thumbnailUrl}
                          alt={item.plant?.name || "Plant"}
                          width={180}
                          height={180}
                          className="rounded-xl object-cover shadow-md"
                        />
                      </div>
                    )}

                    {/* Plant Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {item.plant?.name || "Unknown Plant"}
                          </h3>
                          {item.plant?.price_band && (
                            <p className="text-sm text-gray-600 mt-1">{item.plant.price_band}</p>
                          )}
                        </div>
                        {/* View Details Toggle */}
                        <button
                          onClick={() => togglePlantDetails(item.id)}
                          className="text-sm text-blue-600 hover:text-blue-800 flex-shrink-0"
                        >
                          {expandedPlants.has(item.id) ? "Hide details" : "View details"}
                        </button>
                      </div>

                      {/* Expanded Plant Details */}
                      {expandedPlants.has(item.id) && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2 text-sm">
                          {item.plant?.scientific_name && (
                            <div>
                              <span className="font-medium text-gray-700">Scientific name: </span>
                              <span className="text-gray-600 italic">{item.plant.scientific_name}</span>
                            </div>
                          )}
                          {item.plant?.light && (
                            <div>
                              <span className="font-medium text-gray-700">Light requirement: </span>
                              <span className="text-gray-600">{item.plant.light}</span>
                            </div>
                          )}
                          {item.plant?.watering_requirement && (
                            <div>
                              <span className="font-medium text-gray-700">Watering guidance: </span>
                              <span className="text-gray-600">{item.plant.watering_requirement}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Horticulturist Notes (Read-only) */}
                      {item.why_picked_for_balcony && (
                        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-sm font-medium text-green-900 mb-1">
                            Horticulturist tip 🌱
                          </p>
                          <p className="text-sm text-green-800">
                            {item.why_picked_for_balcony}
                          </p>
                        </div>
                      )}

                      {/* Quantity Control */}
                      {(quantity === null || quantity === undefined || quantity <= 0) ? (
                        /* Show "Add this plant" button when quantity is NULL/undefined/0 (recommended but not selected) */
                        <div className="mt-4">
                          {/* Debug info - remove after testing */}
                          {process.env.NODE_ENV === 'development' && (
                            <div className="text-xs text-gray-400 mb-2">
                              Debug: quantity={String(quantity)}, isEditable={String(isEditable)}, isSubmitted={String(isSubmitted)}, condition={String(isEditable && !isSubmitted)}
                            </div>
                          )}
                          {/* Always show button when quantity is null/undefined/0, but disable if not editable */}
                          <button
                            type="button"
                            onClick={() => addPlant(item.id)}
                            disabled={!isEditable || isSubmitted}
                            className={`inline-block px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                              isEditable && !isSubmitted
                                ? "bg-[#FFD814] hover:bg-[#FCD200] text-gray-900 border border-[#D5D9D1]"
                                : "bg-gray-300 text-gray-500 cursor-not-allowed"
                            }`}
                          >
                            Add this plant
                          </button>
                          {/* Unit price always visible */}
                          {item.plant?.price_band && (
                            <div className="mt-2 text-sm text-gray-600">
                              <span className="font-medium">Unit price: </span>
                              <span>{item.plant.price_band}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Show quantity selector when quantity >= 1 (selected) */
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Quantity
                          </label>
                          <div className="flex items-center gap-3">
                            {/* Minus Button */}
                            <button
                              type="button"
                              onClick={() => decrementQuantity(item.id)}
                              disabled={!isEditable || isSubmitted}
                              className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg font-semibold transition-colors ${
                                !isEditable || isSubmitted
                                  ? "bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed"
                                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100"
                              }`}
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            
                            {/* Quantity Display */}
                            <div className="flex-1 min-w-[60px] text-center">
                              <span className={`text-lg font-semibold ${
                                !isEditable ? "text-gray-500" : "text-gray-900"
                              }`}>
                                {quantity}
                              </span>
                            </div>
                            
                            {/* Plus Button */}
                            <button
                              type="button"
                              onClick={() => incrementQuantity(item.id)}
                              disabled={!isEditable || isSubmitted}
                              className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg font-semibold transition-colors ${
                                !isEditable || isSubmitted
                                  ? "bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed"
                                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100"
                              }`}
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                          
                          {/* Unit price always visible */}
                          {item.plant?.price_band && (
                            <div className="mt-3 text-sm text-gray-600">
                              <span className="font-medium">Unit price: </span>
                              <span>{item.plant.price_band}</span>
                            </div>
                          )}
                          
                          {/* Item Cost - only show when quantity >= 1 */}
                          {itemCost && (
                            <div className="mt-3 text-sm text-gray-600">
                              <span className="font-medium">Estimated cost: </span>
                              <span>
                                {formatCurrency(itemCost.min)} – {formatCurrency(itemCost.max)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Bottom Estimated Total */}
        <div className="min-h-[90px] mb-6">
          <div
            className={`transition-all duration-300 ease-out ${
              hasItems && hasValidEstimate
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            {hasItems && hasValidEstimate && (
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <span className="text-base font-semibold text-gray-900">Estimated total</span>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-2xl font-bold text-gray-900">
                      {formatCurrency(estimate.midpoint)}
                    </span>
                    <span className="text-xs text-gray-500">
                      Final price will vary between {formatCurrency(estimate.min)} – {formatCurrency(estimate.max)} based on nursery availability
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Primary CTA */}
        {isEditable && (
          <div className="bg-white rounded-lg border-2 border-blue-200 p-6 shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-3">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-blue-900">Final confirmation step</span>
            </div>
            <button
              onClick={handleFinalize}
              disabled={isSubmitting || !hasSelectedPlants}
              className="w-full px-6 py-4 text-base font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Submitting..." : "Confirm shortlist"}
            </button>
            {!hasSelectedPlants && (
              <p className="text-sm text-amber-600 text-center mt-3">
                Please add at least one plant (set quantity) before confirming.
              </p>
            )}
            {hasSelectedPlants && (
              <p className="text-xs text-gray-500 text-center mt-3">
                You won't be charged yet. Our team will confirm availability and next steps.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
