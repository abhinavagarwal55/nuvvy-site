"use client";

import { useState, useEffect, use, useMemo } from "react";
import Image from "next/image";
import { buildAffiliateUrl } from "@/lib/catalog/affiliate";
import {
  CATEGORY_LABELS,
  formatPriceInr,
} from "@/lib/catalog/catalogProductLabels";
import type {
  CatalogProductCategory,
  CatalogProductStatus,
} from "@/lib/catalog/catalogProductTypes";

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

interface CatalogProductRef {
  id: string;
  name: string;
  brand: string | null;
  category: CatalogProductCategory;
  price_inr: number | null;
  price_snapshot_at: string | null;
  status: CatalogProductStatus;
  amazon_asin: string | null;
  amazon_url: string | null;
  thumbnail_url?: string | null;
  thumbnail_storage_url?: string | null;
  image_url?: string | null;
  image_storage_url?: string | null;
}

interface VersionItem {
  id: string;
  type?: "plant" | "accessory";
  plant_id: string | null;
  catalog_product_id?: string | null;
  quantity: number | null;
  note: string | null;
  why_picked_for_balcony?: string | null;
  plant: Plant | null;
  catalog_product?: CatalogProductRef | null;
}

interface Version {
  id: string;
  version_number: number;
  status_at_time: string;
  created_at: string;
}

interface Section {
  id: string;
  name: string;
  sort_order: number;
  items: VersionItem[];
  accessories?: VersionItem[];
}

interface ShortlistData {
  version: Version;
  items: VersionItem[];
  sections?: Section[];
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
  const [expandedPlants, setExpandedPlants] = useState<Set<string>>(new Set());
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  // Post-confirmation flow: plants → confirmed (order summary) → accessories.
  const [phase, setPhase] = useState<"plants" | "confirmed" | "accessories">("plants");
  const [selectedAccessories, setSelectedAccessories] = useState<Set<string>>(new Set());
  const [savingAccessories, setSavingAccessories] = useState(false);

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
          throw new Error(result.body?.error || "Failed to load curated list");
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
        setError(err instanceof Error ? err.message : "Failed to load curated list");
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
    
    // Allow null (removes from selection)
    // Allow numbers >= 1 (selected)
    // Block numbers < 1 (invalid)
    if (quantity !== null && (isNaN(quantity) || quantity < 1)) {
      return;
    }

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
    // Handle null, undefined, or invalid quantities
    if (currentQty == null || currentQty <= 0) {
      // If null, undefined, or <= 0, set to 1 (add plant)
      updateQuantity(itemId, 1);
    } else {
      // TypeScript now knows currentQty is a number >= 1
      const qty: number = currentQty;
      updateQuantity(itemId, qty + 1);
    }
  };

  // Decrement quantity
  const decrementQuantity = (itemId: string) => {
    if (!isEditable) return;
    
    setItems((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId) || { quantity: null, note: "" };
      const currentQty = current.quantity;
      
      // If quantity is 1, reduce to null (remove from selection)
      if (currentQty === 1) {
        newMap.set(itemId, { ...current, quantity: null });
        return newMap;
      }
      
      // If quantity is null, undefined, or 0, already at minimum
      if (currentQty == null || currentQty <= 0) {
        return newMap;
      }
      
      // If quantity > 1, decrement by 1
      if (typeof currentQty === 'number' && currentQty > 1) {
        newMap.set(itemId, { ...current, quantity: currentQty - 1 });
        return newMap;
      }
      
      return newMap;
    });
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

  // Post-confirmation accessories, grouped BY section — only sections where the
  // customer selected >=1 plant AND that have recommended accessories.
  const computeAccessorySections = (): { id: string; name: string; accessories: VersionItem[] }[] => {
    if (!data?.sections) return [];
    return data.sections
      .filter((sec) => sec.items.some((pi) => (items.get(pi.id)?.quantity ?? 0) >= 1))
      .map((sec) => ({ id: sec.id, name: sec.name, accessories: sec.accessories ?? [] }))
      .filter((sec) => sec.accessories.length > 0);
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
      // Build items array from current state. Only plant items are
      // submitted by the customer — accessories carry over server-side
      // from the source SENT version (see finalize endpoint). The
      // customer doesn't select accessories via qty; the Buy-on-Amazon
      // CTA is the only action.
      const itemsToSubmit = Array.from(items.entries())
        .filter(([itemId, state]) => {
          const original = data.items.find((item) => item.id === itemId);
          if (!original) return false;
          const isPlant =
            (original.type ?? (original.catalog_product_id ? "accessory" : "plant")) === "plant";
          if (!isPlant) return false;
          const hasQuantity = state.quantity !== null && state.quantity !== undefined && state.quantity >= 1;
          return hasQuantity;
        })
        .map(([itemId, state]) => {
          const original = data.items.find((item) => item.id === itemId)!;
          return {
            plant_id: original.plant_id!,
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
        throw new Error(result.body?.error || "Failed to submit curated list");
      }

      // Success — show the order-placed summary; accessories are opt-in from there.
      setPhase("confirmed");
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    } catch (err) {
      console.error("Error finalizing shortlist:", err);
      alert(err instanceof Error ? err.message : "Failed to submit curated list");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Capture the customer's accessory picks (non-binding), then return to summary.
  const handleSaveAccessories = async () => {
    setSavingAccessories(true);
    try {
      // Dedup by product (UNIQUE constraint) while tagging the section it came from.
      const seen = new Set<string>();
      const selections: { catalog_product_id: string; section_id: string | null }[] = [];
      for (const sec of computeAccessorySections()) {
        for (const acc of sec.accessories) {
          const pid = acc.catalog_product_id;
          if (pid && selectedAccessories.has(pid) && !seen.has(pid)) {
            seen.add(pid);
            selections.push({ catalog_product_id: pid, section_id: sec.id });
          }
        }
      }
      await fetch(`/api/shortlists/public/${token}/accessories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections }),
      });
    } catch (err) {
      console.error("Error saving accessory selections:", err);
      // Non-binding — proceed regardless.
    } finally {
      setSavingAccessories(false);
      setPhase("confirmed");
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    }
  };

  const toggleAccessory = (id: string) => {
    setSelectedAccessories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading your curated list...</p>
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
            {isServiceError ? "Service Unavailable" : "Curated List Not Found"}
          </h1>
          <p className="text-gray-600">
            {isServiceError
              ? "This link is temporarily unavailable. Please contact Nuvvy."
              : (error || "The curated list you're looking for doesn't exist or is no longer available.")
            }
          </p>
        </div>
      </div>
    );
  }

  // Order-placed summary — after the customer confirms their plants.
  if (phase === "confirmed") {
    const selectedPlants = data.items
      .filter((i) => (i.type ?? (i.catalog_product_id ? "accessory" : "plant")) === "plant")
      .map((i) => ({ item: i, qty: items.get(i.id)?.quantity ?? 0 }))
      .filter((x) => x.qty >= 1);
    const totalCount = selectedPlants.reduce((n, x) => n + x.qty, 0);
    const hasAccessoryRecs = computeAccessorySections().length > 0;

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-6">
            <svg className="mx-auto h-14 w-14 text-green-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Order placed 🌿</h1>
            <p className="text-base text-gray-600">
              Thank you for placing your order with Nuvvy. We&apos;ll confirm availability and install date with you shortly.
            </p>
          </div>

          {/* Order summary */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
              Your order · {totalCount} plant{totalCount === 1 ? "" : "s"}
            </h2>
            <div className="divide-y divide-gray-100">
              {selectedPlants.map(({ item, qty }) => {
                const thumb = getThumbnailUrl(item.plant);
                return (
                  <div key={item.id} className="flex items-center gap-3 py-2.5">
                    {thumb ? (
                      <Image src={thumb} alt={item.plant?.name || "Plant"} width={56} height={56} className="rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gray-100 border border-gray-200 flex-shrink-0" />
                    )}
                    <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                      {item.plant?.name || "Plant"}
                    </p>
                    <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">× {qty}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Accessory recommendations entry point */}
          {hasAccessoryRecs && (
            <>
              <p className="text-sm text-gray-600 text-center mb-3">
                We have curated pots and other accessory recommendations based on the plants you have selected.
              </p>
              <button
                onClick={() => {
                  setPhase("accessories");
                  if (typeof window !== "undefined") window.scrollTo({ top: 0 });
                }}
                className="w-full px-6 py-4 text-base font-semibold text-white bg-leaf rounded-md hover:bg-leaf/90 flex items-center justify-center gap-2"
              >
                Pots and other accessory recommendations →
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Accessories step — recommended accessories grouped by section (only sections
  // where the customer picked >=1 plant). Mobile-first: big images, terse copy,
  // whole card taps through to Amazon.
  if (phase === "accessories") {
    const accSections = computeAccessorySections();
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button
            onClick={() => {
              setPhase("confirmed");
              if (typeof window !== "undefined") window.scrollTo({ top: 0 });
            }}
            className="text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            ← Back to order
          </button>
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">A few accessories for your plants 🪴</h1>
            <p className="text-base text-gray-700">We recommend you buy these accessories from Amazon.</p>
            <p className="text-xs text-gray-500 mt-2">
              Nuvvy may earn a small commission when you purchase through these links, at no extra cost to you. We only
              recommend products our horticulturists trust.
            </p>
          </div>

          {accSections.map((sec) => (
            <div key={sec.id} className="mb-7">
              <h2 className="text-base font-semibold text-gray-900 mb-3">{sec.name}</h2>
              <div className="space-y-3">
                {sec.accessories.map((item) => {
                  const cp = item.catalog_product;
                  if (!cp) return null;
                  const thumb =
                    cp.thumbnail_storage_url || cp.thumbnail_url || cp.image_storage_url || cp.image_url || null;
                  const buyHref = buildAffiliateUrl({ amazon_asin: cp.amazon_asin, amazon_url: cp.amazon_url });
                  const isSelected = selectedAccessories.has(cp.id);
                  const isUnavailable = cp.status === "inactive" || cp.status === "unavailable";
                  const tappable = Boolean(buyHref) && !isUnavailable;

                  const inner = (
                    <>
                      {thumb ? (
                        <Image src={thumb} alt={cp.name} width={128} height={128} className="w-28 h-28 sm:w-32 sm:h-32 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-lg bg-gray-100 border border-gray-200 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink line-clamp-2">{cp.name}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                          {cp.brand ? `${cp.brand} · ` : ""}
                          {CATEGORY_LABELS[cp.category] ?? cp.category}
                        </p>
                        {cp.price_inr != null ? (
                          <p className="text-base font-semibold text-leaf mt-1">{formatPriceInr(cp.price_inr)}</p>
                        ) : (
                          <p className="text-sm text-gray-500 mt-1">Price on Amazon</p>
                        )}
                        {isUnavailable ? (
                          <span className="inline-block mt-1 text-[11px] text-amber-700">Currently unavailable</span>
                        ) : tappable ? (
                          <span className="inline-block mt-1 text-sm font-medium text-leaf">Buy on Amazon →</span>
                        ) : null}
                      </div>
                    </>
                  );

                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-lg border shadow-sm overflow-hidden ${isSelected ? "border-leaf ring-1 ring-leaf" : "border-gray-200"}`}
                    >
                      {tappable ? (
                        <a href={buyHref!} target="_blank" rel="sponsored noopener noreferrer" className="flex gap-3 p-3 items-start hover:bg-gray-50">
                          {inner}
                        </a>
                      ) : (
                        <div className="flex gap-3 p-3 items-start">{inner}</div>
                      )}
                      <label className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleAccessory(cp.id)}
                          className="w-4 h-4 accent-[#22A559]"
                        />
                        I want this
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <button
            onClick={handleSaveAccessories}
            disabled={savingAccessories}
            className="w-full px-6 py-3.5 text-base font-semibold text-white bg-leaf rounded-md hover:bg-leaf/90 disabled:opacity-50"
          >
            {savingAccessories ? "Saving…" : "Done — back to order"}
          </button>
        </div>
      </div>
    );
  }

  const customerName = data.customer_name;
  const hasValidEstimate = estimate.min > 0 || estimate.max > 0;
  const hasItems = data && data.items && data.items.length > 0 && Array.from(items.values()).some(item => item.quantity !== null && item.quantity > 0);
  
  // Check if at least one plant has quantity >= 1 (selected for procurement)
  const hasSelectedPlants = Array.from(items.values()).some(item => item.quantity !== null && item.quantity !== undefined && item.quantity >= 1);

  // ── Section pagination (plants only) ───────────────────────────────────────
  const allPlantItems = data.items.filter(
    (i) => (i.type ?? (i.catalog_product_id ? "accessory" : "plant")) === "plant"
  );
  const rawSections = (data.sections ?? []).filter((s) => s.items.length > 0);
  const plantSections: Section[] =
    rawSections.length > 0
      ? rawSections
      : allPlantItems.length > 0
      ? [{ id: "all", name: "Plants", sort_order: 0, items: allPlantItems }]
      : [];
  const isMultiSection = plantSections.length > 1;
  const sectionIdx = Math.min(currentSectionIdx, Math.max(0, plantSections.length - 1));
  const currentSection = plantSections[sectionIdx];
  const visiblePlantItems = isMultiSection ? currentSection?.items ?? [] : allPlantItems;
  const onLastSection = sectionIdx >= plantSections.length - 1;
  const showFinalArea = !isMultiSection || onLastSection;

  // Subtotal (midpoint + range) for a set of plant items from current selections.
  const subtotalFor = (secItems: VersionItem[]): { min: number; max: number } => {
    let min = 0;
    let max = 0;
    secItems.forEach((item) => {
      const qty = items.get(item.id)?.quantity ?? 0;
      if (qty <= 0) return;
      const band = parsePriceBand(item.plant?.price_band);
      if (band) {
        min += band.min * qty;
        max += band.max * qty;
      }
    });
    return { min, max };
  };
  const sectionSubtotal = currentSection ? subtotalFor(currentSection.items) : { min: 0, max: 0 };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Personalized Hero Header */}
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            {customerName ? `${customerName}, here's your curated plant list 🌿` : "Here's your curated plant list 🌿"}
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

        {/* Top Estimated Total — only renders when there's something to show */}
        {hasItems && hasValidEstimate && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm mb-6">
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

        {/* Read-only banner for submitted shortlists */}
        {isSubmitted && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-800 text-sm flex items-center gap-2">
              <span>✅</span>
              <span>Curated list confirmed. Our team is reviewing this and will contact you shortly.</span>
            </p>
          </div>
        )}

        {/* Multi-section callout */}
        {isMultiSection && (
          <div className="bg-mist border border-leaf/20 rounded-lg p-4 mb-6">
            <p className="text-sm text-ink text-center">
              This curated list has {plantSections.length} sections — you&apos;ll review them one at a time.
            </p>
          </div>
        )}

        {/* Current section header (multi only) */}
        {isMultiSection && currentSection && (
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Section {sectionIdx + 1} of {plantSections.length}
              </p>
              <h2 className="text-xl font-bold text-gray-900">{currentSection.name}</h2>
            </div>
          </div>
        )}

        {/* Plant Items */}
        <div className="space-y-4 mb-6">
          {visiblePlantItems
            .map((item) => {
              const itemState = items.get(item.id);
              // Use explicit null check: quantity = null means recommended but not selected
              // If itemState exists, use its quantity (even if null) - this respects user changes
              // Only fall back to item.quantity if itemState doesn't exist in the Map
              const quantity = itemState !== undefined 
                ? itemState.quantity 
                : (item.quantity ?? null);

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

        {/* Section subtotal + pagination (multi-section only) */}
        {isMultiSection && (
          <div className="mb-6 space-y-4">
            {(sectionSubtotal.min > 0 || sectionSubtotal.max > 0) && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-900">This section&apos;s subtotal</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(Math.round((sectionSubtotal.min + sectionSubtotal.max) / 2))}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setCurrentSectionIdx((i) => Math.max(0, i - 1));
                  if (typeof window !== "undefined") window.scrollTo({ top: 0 });
                }}
                disabled={sectionIdx === 0}
                className="px-5 py-2.5 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Back
              </button>
              <span className="text-xs text-gray-500">
                Section {sectionIdx + 1} of {plantSections.length}
              </span>
              {!onLastSection ? (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentSectionIdx((i) => Math.min(plantSections.length - 1, i + 1));
                    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
                  }}
                  className="px-5 py-2.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  Next section →
                </button>
              ) : (
                <span className="text-xs text-gray-400">Last section</span>
              )}
            </div>
          </div>
        )}

        {/* Bottom Estimated Total — collapses cleanly when nothing to show */}
        {hasItems && hasValidEstimate && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm mb-6">
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


        {/* Explore-full-catalog CTA */}
        {showFinalArea && (
        <div className="bg-mist border border-leaf/20 rounded-lg p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-ink mb-1">
                Want to explore more plants and accessories?
              </h3>
              <p className="text-sm text-gray-600">
                Browse the full Nuvvy catalog — you can come right back to this curated list.
              </p>
            </div>
            <a
              href={`/plantcatalog?shortlist=${token}`}
              className="inline-flex items-center justify-center bg-leaf text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-leaf/90 whitespace-nowrap"
            >
              Browse catalog →
            </a>
          </div>
        </div>
        )}

        {/* Primary CTA */}
        {isEditable && showFinalArea && (
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
              {isSubmitting ? "Submitting..." : "Confirm Order"}
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
