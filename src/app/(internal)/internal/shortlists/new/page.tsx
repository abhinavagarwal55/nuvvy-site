"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { PLANT_CATEGORIES, LIGHT_CONDITIONS, PRICE_BANDS } from "@/config/plantOptions";

// Types
interface Plant {
  id: string;
  name: string;
  scientific_name?: string | null;
  category?: string;
  light?: string;
  watering_requirement?: string;
  fertilization_requirement?: string;
  soil_mix?: string;
  toxicity?: string;
  lifespan?: string;
  horticulturist_notes?: string;
  can_be_procured?: boolean;
  price_band?: string | null;
  created_at?: string;
  updated_at?: string;
  thumbnail_url?: string;
  thumbnail_storage_url?: string;
  image_url?: string;
  image_storage_url?: string;
}

interface Customer {
  id: string;
  name: string;
  phone_number: string;
  address: string;
  status: "ACTIVE" | "INACTIVE";
}

interface SelectedPlant {
  plant: Plant;
  itemId?: string; // Store item ID for existing shortlist items
}

export default function NewShortlistPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId");
  const shortlistId = searchParams.get("shortlistId");
  
  // Customer state
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [customerError, setCustomerError] = useState<string | null>(null);
  
  // Shortlist rehydration state
  const [loadingShortlist, setLoadingShortlist] = useState(false);
  const [existingShortlistId, setExistingShortlistId] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<Array<{ plant_id: string; item_id?: string }>>([]);
  
  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  
  // Plants catalog - fetch exactly like /internal/plants does
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loadingPlants, setLoadingPlants] = useState(true);
  const [plantsError, setPlantsError] = useState<string | null>(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [lightFilter, setLightFilter] = useState<string>("all");
  const [priceBandFilter, setPriceBandFilter] = useState<string[]>([]); // Multi-select for price bands
  const [isPriceBandPopoverOpen, setIsPriceBandPopoverOpen] = useState(false);
  
  // Selected plants state
  const [selectedPlants, setSelectedPlants] = useState<Map<string, SelectedPlant>>(new Map());
  
  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Fetch customer
  useEffect(() => {
    if (!customerId) {
      setCustomerError("Customer ID is required");
      setLoadingCustomer(false);
      return;
    }
    
    fetch(`/api/internal/customers/${customerId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.data) {
          const cust = data.data;
          if (cust.status !== "ACTIVE") {
            setCustomerError("Shortlists can only be created for ACTIVE customers");
          } else {
            setCustomer(cust);
          }
        } else {
          setCustomerError(data.error || "Customer not found");
        }
        setLoadingCustomer(false);
      })
      .catch((err) => {
        console.error("Error fetching customer:", err);
        setCustomerError("Failed to load customer");
        setLoadingCustomer(false);
      });
  }, [customerId]);
  
  // Fetch existing shortlist and items if shortlistId is provided
  useEffect(() => {
    if (!shortlistId) {
      setLoadingShortlist(false);
      return;
    }
    
    const fetchShortlist = async () => {
      setLoadingShortlist(true);
      try {
        const response = await fetch(`/api/internal/shortlists/${shortlistId}`);
        const result = await response.json();
        
        if (!response.ok || result.error) {
          console.error("Error fetching shortlist:", result.error);
          setLoadingShortlist(false);
          return;
        }
        
        const shortlistData = result.data;
        if (shortlistData?.shortlist) {
          // Pre-populate form
          setTitle(shortlistData.shortlist.title || "");
          setDescription(shortlistData.shortlist.description || "");
          setExistingShortlistId(shortlistId);
          
          // Rehydrate selected plants from items
          if (shortlistData.items && Array.isArray(shortlistData.items)) {
            const selectedMap = new Map<string, SelectedPlant>();
            const pending: Array<{ plant_id: string; item_id: string }> = [];
            
            shortlistData.items.forEach((item: any) => {
              // Get plant ID from direct field or relation
              const plantId = item.plant_id || item.plant?.id;
              if (!plantId) return;
              
              // Try to use plant data from relation first, then find in plants catalog
              let plant: Plant | undefined;
              
              if (item.plant && item.plant.id) {
                // Use plant data from API response relation (preferred)
                plant = {
                  id: item.plant.id,
                  name: item.plant.name || "",
                  scientific_name: item.plant.scientific_name || null,
                  price_band: item.plant.price_band || null,
                  light: item.plant.light || undefined,
                  watering_requirement: item.plant.watering_requirement || undefined,
                  thumbnail_url: item.plant.thumbnail_url || undefined,
                  thumbnail_storage_url: item.plant.thumbnail_storage_url || undefined,
                  image_url: item.plant.image_url || undefined,
                  image_storage_url: item.plant.image_storage_url || undefined,
                };
              } else {
                // Fallback: find in plants catalog if already loaded
                plant = plants.find((p) => p.id === plantId);
              }
              
              if (plant) {
                selectedMap.set(plant.id, {
                  plant,
                  itemId: item.id,
                });
              } else {
                // Plant not found yet - store for later mapping when plants catalog loads
                pending.push({
                  plant_id: plantId,
                  item_id: item.id,
                });
              }
            });
            
            // Update selected plants if we found any from relation
            if (selectedMap.size > 0) {
              setSelectedPlants(selectedMap);
            }
            
            // Store pending items for later mapping
            if (pending.length > 0) {
              setPendingItems(pending);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching shortlist:", err);
      } finally {
        setLoadingShortlist(false);
      }
    };
    
    fetchShortlist();
  }, [shortlistId]);
  
  // Map pending items to selected plants once plants catalog is loaded
  useEffect(() => {
    if (pendingItems.length === 0 || plants.length === 0) {
      return;
    }
    
    const selectedMap = new Map<string, SelectedPlant>();
    pendingItems.forEach((item) => {
      const plant = plants.find((p) => p.id === item.plant_id);
      if (plant) {
        selectedMap.set(plant.id, { 
          plant,
          itemId: item.item_id,
        });
      }
    });
    
    if (selectedMap.size > 0) {
      setSelectedPlants(selectedMap);
      setPendingItems([]); // Clear pending items after mapping
    }
  }, [pendingItems, plants]);
  
  // Fetch plants - exactly like /internal/plants does (no filters, show all)
  useEffect(() => {
    const fetchPlants = async () => {
      setLoadingPlants(true);
      setPlantsError(null);
      
      try {
        // Fetch with a large limit to get all plants
        const params = new URLSearchParams({
          limit: "10000",
          offset: "0",
          published: "all",
        });
        
        const response = await fetch(`/api/internal/plants?${params}`);
        const result = await response.json();
        
        if (!response.ok || result.error) {
          throw new Error(result.error || "Failed to fetch plants");
        }
        
        setPlants(result.data || []);
      } catch (err) {
        console.error("Error fetching plants:", err);
        setPlantsError(err instanceof Error ? err.message : "Failed to load plants");
      } finally {
        setLoadingPlants(false);
      }
    };
    
    fetchPlants();
  }, []);
  
  // Helper to get thumbnail URL
  const getThumbnailUrl = (plant: Plant): string | null => {
    return plant.thumbnail_storage_url || plant.image_storage_url || plant.thumbnail_url || plant.image_url || null;
  };
  
  // Filter plants based on search and filters
  const filteredPlants = useMemo(() => {
    let filtered = plants;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((plant) => 
        plant.name.toLowerCase().includes(query) ||
        (plant.scientific_name && plant.scientific_name.toLowerCase().includes(query))
      );
    }
    
    // Apply category filter
    if (categoryFilter !== "all") {
      filtered = filtered.filter((plant) => plant.category === categoryFilter);
    }
    
    // Apply light filter
    if (lightFilter !== "all") {
      filtered = filtered.filter((plant) => plant.light === lightFilter);
    }
    
    // Apply price band filter (multi-select)
    if (priceBandFilter.length > 0) {
      filtered = filtered.filter((plant) => {
        // Check if "not-set" is selected and plant has no price band
        const hasNotSet = priceBandFilter.includes("not-set");
        const isNotSet = !plant.price_band || plant.price_band.trim() === "";
        
        if (hasNotSet && isNotSet) {
          return true;
        }
        
        // Check if plant's price band matches any selected price bands
        return priceBandFilter.includes(plant.price_band || "");
      });
    }
    
    return filtered;
  }, [plants, searchQuery, categoryFilter, lightFilter, priceBandFilter]);
  
  // Handle add plant to shortlist
  const handleAddPlant = async (plant: Plant) => {
    // Update local state immediately
    const newSelected = new Map(selectedPlants);
    newSelected.set(plant.id, {
      plant,
    });
    setSelectedPlants(newSelected);
    
    // If editing existing shortlist, sync with database
    if (existingShortlistId) {
      try {
        const response = await fetch(`/api/internal/shortlists/${existingShortlistId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shortlist_id: existingShortlistId,
            plant_id: plant.id,
          }),
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          console.error("Error adding plant to shortlist:", result.error);
          // Revert local state on error
          newSelected.delete(plant.id);
          setSelectedPlants(newSelected);
          alert("Failed to add plant. Please try again.");
        } else if (result.data?.id) {
          // Update local state with item ID
          newSelected.set(plant.id, {
            plant,
            itemId: result.data.id,
          });
          setSelectedPlants(newSelected);
        }
      } catch (err) {
        console.error("Error adding plant:", err);
        // Revert local state on error
        newSelected.delete(plant.id);
        setSelectedPlants(newSelected);
        alert("Failed to add plant. Please try again.");
      }
    }
  };
  
  // Handle remove plant from shortlist
  const handleRemovePlant = async (plantId: string) => {
    // Get the selected plant to preserve itemId
    const selectedPlant = selectedPlants.get(plantId);
    if (!selectedPlant) return;
    
    // Update local state immediately
    const newSelected = new Map(selectedPlants);
    newSelected.delete(plantId);
    setSelectedPlants(newSelected);
    
    // If editing existing shortlist and item has an ID, delete from database
    if (existingShortlistId && selectedPlant.itemId) {
      try {
        const deleteResponse = await fetch(`/api/internal/shortlists/${existingShortlistId}/items/${selectedPlant.itemId}`, {
          method: "DELETE",
        });
        
        if (!deleteResponse.ok) {
          const deleteResult = await deleteResponse.json();
          console.error("Error removing plant from shortlist:", deleteResult.error);
          // Revert local state on error
          newSelected.set(plantId, selectedPlant);
          setSelectedPlants(newSelected);
          alert("Failed to remove plant. Please try again.");
        }
      } catch (err) {
        console.error("Error removing plant:", err);
        // Revert local state on error
        newSelected.set(plantId, selectedPlant);
        setSelectedPlants(newSelected);
        alert("Failed to remove plant. Please try again.");
      }
    }
  };
  
  // Handle save draft
  const handleSaveDraft = async () => {
    // Validate
    setTitleError(null);
    setSubmitError(null);
    
    if (!title.trim()) {
      setTitleError("Shortlist title is required");
      return;
    }
    
    if (selectedPlants.size === 0) {
      setSubmitError("Please add at least one plant to the shortlist");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      let shortlistIdToUse = existingShortlistId;
      
      // If editing existing shortlist, update it
      if (existingShortlistId) {
        const updateResponse = await fetch(`/api/internal/shortlists/${existingShortlistId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
          }),
        });
        
        const updateResult = await updateResponse.json();
        
        if (!updateResponse.ok) {
          throw new Error(updateResult.error || "Failed to update shortlist");
        }
        
        shortlistIdToUse = existingShortlistId;
      } else {
        // Create new shortlist
        const items = Array.from(selectedPlants.values()).map((selected) => ({
          plant_id: selected.plant.id,
        }));
        
        const response = await fetch("/api/internal/shortlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_uuid: customerId,
            title: title.trim(),
            description: description.trim() || null,
            status: "DRAFT",
            items,
          }),
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || "Failed to save shortlist");
        }
        
        shortlistIdToUse = result.data.id;
      }
      
      // Redirect to shortlist configuration page (Step 2)
      router.push(`/internal/shortlists/${shortlistIdToUse}`);
    } catch (err) {
      console.error("Error saving shortlist:", err);
      setSubmitError(err instanceof Error ? err.message : "Failed to save shortlist");
      setIsSubmitting(false);
    }
  };
  
  // Loading customer
  if (loadingCustomer) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Loading customer...</p>
        </div>
      </div>
    );
  }
  
  // Customer error
  if (customerError || !customer) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Shortlist</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{customerError || "Customer not found"}</p>
        </div>
        <button
          onClick={() => router.push("/internal/customers")}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          ← Back to Customers
        </button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Shortlist - Step 1: Select Plants</h1>
        <p className="text-sm text-gray-600 mt-1">Choose plants for the shortlist. You'll configure quantity and notes in the next step.</p>
      </div>
      
      {/* Customer Info */}
      <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Customer</h2>
        <div className="space-y-2">
          <div>
            <span className="text-sm font-medium text-gray-700">Name: </span>
            <span className="text-sm text-gray-900">{customer.name}</span>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Phone: </span>
            <span className="text-sm text-gray-900">{customer.phone_number}</span>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Address: </span>
            <span className="text-sm text-gray-900">{customer.address}</span>
          </div>
        </div>
      </div>
      
      {/* Shortlist Details */}
      <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Shortlist Details</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Shortlist Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleError(null);
              }}
              placeholder="e.g., Indoor Plants for Living Room"
              className={`w-full px-3 py-2 border ${
                titleError ? "border-red-500" : "border-gray-300"
              } rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            {titleError && <p className="mt-1 text-sm text-red-600">{titleError}</p>}
          </div>
          
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional notes about this shortlist..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
      
      {/* Selected Plants */}
      {selectedPlants.size > 0 && (
        <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Selected Plants ({selectedPlants.size})
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              You can configure quantity and notes for each plant in the next step
            </p>
          </div>
          <div className="space-y-4">
            {Array.from(selectedPlants.values()).map((selected) => (
              <div
                key={selected.plant.id}
                className="border border-gray-200 rounded-lg p-4 space-y-3"
              >
                {/* Plant Info - Read-only */}
                <div className="flex items-start gap-4">
                  {getThumbnailUrl(selected.plant) && (
                    <div className="flex-shrink-0">
                      <Image
                        src={getThumbnailUrl(selected.plant) || ""}
                        alt={selected.plant.name}
                        width={60}
                        height={60}
                        className="rounded object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-gray-900">{selected.plant.name}</h3>
                    <p className="text-sm text-gray-600 italic">{selected.plant.scientific_name}</p>
                    <div className="flex gap-4 mt-1 text-xs text-gray-500">
                      <span>Category: {selected.plant.category || "-"}</span>
                      <span>Light: {selected.plant.light || "-"}</span>
                      <span>Price: {selected.plant.price_band || "-"}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemovePlant(selected.plant.id)}
                    className="flex-shrink-0 text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Continue Button - Show when plants are selected */}
      {selectedPlants.size > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleSaveDraft}
            disabled={isSubmitting || !title.trim()}
            className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Saving..." : "Continue to configure shortlist →"}
          </button>
        </div>
      )}
      
      {/* Plant Selection - Exact table from /internal/plants */}
      <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Plants to Shortlist</h2>
        
        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          {/* Search Bar */}
          <div>
            <label htmlFor="plant-search" className="block text-sm font-medium text-gray-700 mb-2">
              Search Plants
            </label>
            <input
              id="plant-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or scientific name..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category Filter */}
            <div>
              <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                id="category-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                {PLANT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Light Filter */}
            <div>
              <label htmlFor="light-filter" className="block text-sm font-medium text-gray-700 mb-2">
                Light Requirement
              </label>
              <select
                id="light-filter"
                value={lightFilter}
                onChange={(e) => setLightFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Light Conditions</option>
                {LIGHT_CONDITIONS.map((light) => (
                  <option key={light} value={light}>
                    {light}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Price Band Filter - Multi-select */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price Band
              </label>
              <button
                type="button"
                onClick={() => setIsPriceBandPopoverOpen(!isPriceBandPopoverOpen)}
                className="w-full px-4 py-2 text-left border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {priceBandFilter.length === 0 ? (
                  <span className="text-gray-500">Select price bands...</span>
                ) : (
                  <span className="text-gray-900">
                    {priceBandFilter.length} selected
                  </span>
                )}
              </button>
              {isPriceBandPopoverOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsPriceBandPopoverOpen(false)}
                  />
                  {/* Popover */}
                  <div className="absolute left-0 top-full mt-2 z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">Select Price Bands</h3>
                      <button
                        type="button"
                        onClick={() => setPriceBandFilter([])}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {/* Not Set option */}
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={priceBandFilter.includes("not-set")}
                          onChange={() => {
                            setPriceBandFilter((prev) =>
                              prev.includes("not-set")
                                ? prev.filter((b) => b !== "not-set")
                                : [...prev, "not-set"]
                            );
                          }}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 italic">Not Set (Blank)</span>
                      </label>
                      {/* Price band options */}
                      {PRICE_BANDS.map((band) => (
                        <label key={band} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={priceBandFilter.includes(band)}
                            onChange={() => {
                              setPriceBandFilter((prev) =>
                                prev.includes(band)
                                  ? prev.filter((b) => b !== band)
                                  : [...prev, band]
                              );
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{band}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Active Filters Summary */}
          {(searchQuery || categoryFilter !== "all" || lightFilter !== "all" || priceBandFilter.length > 0) && (
            <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600">
              <span className="font-medium">Active filters:</span>
              {searchQuery && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                  Search: "{searchQuery}"
                </span>
              )}
              {categoryFilter !== "all" && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                  Category: {categoryFilter}
                </span>
              )}
              {lightFilter !== "all" && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                  Light: {lightFilter}
                </span>
              )}
              {priceBandFilter.map((band) => (
                <span key={band} className="px-2 py-1 bg-blue-100 text-blue-800 rounded flex items-center gap-1">
                  Price: {band === "not-set" ? "Not Set" : band}
                  <button
                    onClick={() => setPriceBandFilter((prev) => prev.filter((b) => b !== band))}
                    className="ml-1 text-blue-600 hover:text-blue-900"
                    title="Remove filter"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={() => {
                  setSearchQuery("");
                  setCategoryFilter("all");
                  setLightFilter("all");
                  setPriceBandFilter([]);
                }}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium ml-2"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
        
        {loadingPlants && (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading plants...</p>
          </div>
        )}
        
        {plantsError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{plantsError}</p>
          </div>
        )}
        
        {!loadingPlants && !plantsError && plants.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">No plants available</p>
          </div>
        )}
        
        {!loadingPlants && !plantsError && plants.length > 0 && filteredPlants.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">No plants match your filters</p>
            <button
              onClick={() => {
                setSearchQuery("");
                setCategoryFilter("all");
                setLightFilter("all");
                setPriceBandFilter([]);
              }}
              className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Clear filters
            </button>
          </div>
        )}
        
        {!loadingPlants && !plantsError && filteredPlants.length > 0 && (
          <>
            {/* Desktop Table - copied from /internal/plants */}
            <div className="hidden lg:block overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Thumbnail
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Scientific Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Category
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Light
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Watering
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Price Band
                      </th>
                      <th className="sticky right-0 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap z-10">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredPlants.map((plant) => {
                      const thumbnailUrl = getThumbnailUrl(plant);
                      const isAdded = selectedPlants.has(plant.id);
                      return (
                        <tr key={plant.id} className="hover:bg-gray-50 group">
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
                            <div className="text-sm text-gray-500 italic">{plant.scientific_name || "-"}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {plant.category ? (
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                                {plant.category}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {plant.light ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                                <span>
                                  {plant.light === "Bright indirect" ? "🌤" :
                                   plant.light === "Medium indirect" ? "🌥" :
                                   plant.light === "Bright indirect to partial shade" ? "🌤" :
                                   plant.light === "Partial sunlight (4–6 hours)" ? "🌤" :
                                   plant.light === "Full sunlight (6–8 hours)" ? "☀️" :
                                   "🌱"}
                                </span>
                                <span>{plant.light}</span>
                              </span>
                            ) : (
                              <span className="text-sm text-gray-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div 
                              className="text-sm text-gray-600 line-clamp-2" 
                              title={plant.watering_requirement || undefined}
                            >
                              {plant.watering_requirement || "-"}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {plant.price_band || "-"}
                            </div>
                          </td>
                          <td className="sticky right-0 bg-white group-hover:bg-gray-50 px-4 py-3 whitespace-nowrap z-10">
                            {isAdded ? (
                              <span className="text-green-600 text-sm font-medium">✓ Added</span>
                            ) : (
                              <button
                                onClick={() => handleAddPlant(plant)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                Add to Shortlist
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards - copied from /internal/plants */}
            <div className="lg:hidden space-y-3">
              {filteredPlants.map((plant) => {
                const thumbnailUrl = getThumbnailUrl(plant);
                const isAdded = selectedPlants.has(plant.id);
                return (
                  <div
                    key={plant.id}
                    className="bg-white rounded-lg border border-gray-200 p-4 space-y-3"
                  >
                    {/* Top row: thumbnail + name + scientific name */}
                    <div className="flex items-start gap-3">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0">
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
                            <span className="text-xs text-gray-400">No img</span>
                          </div>
                        )}
                      </div>
                      {/* Name + scientific */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{plant.name}</div>
                        <div className="text-xs text-gray-500 italic mt-0.5">
                          {plant.scientific_name || "-"}
                        </div>
                      </div>
                    </div>
                    {/* Second row: category + light pills */}
                    <div className="flex flex-wrap gap-2">
                      {plant.category && (
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                          {plant.category}
                        </span>
                      )}
                      {plant.light && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                          <span>
                            {plant.light === "Bright indirect" ? "🌤" :
                             plant.light === "Medium indirect" ? "🌥" :
                             plant.light === "Bright indirect to partial shade" ? "🌤" :
                             plant.light === "Partial sunlight (4–6 hours)" ? "🌤" :
                             plant.light === "Full sunlight (6–8 hours)" ? "☀️" :
                             "🌱"}
                          </span>
                          <span>{plant.light}</span>
                        </span>
                      )}
                    </div>
                    {/* Third row: watering */}
                    {plant.watering_requirement && (
                      <div className="text-xs text-gray-600 line-clamp-1">
                        <span className="font-medium">Watering:</span> {plant.watering_requirement}
                      </div>
                    )}
                    {/* Bottom row: action */}
                    <div className="flex justify-end pt-2">
                      {isAdded ? (
                        <span className="text-green-600 text-sm font-medium">✓ Added</span>
                      ) : (
                        <button
                          onClick={() => handleAddPlant(plant)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Add to Shortlist
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Show count */}
            <div className="mt-3 text-sm text-gray-600">
              Showing {filteredPlants.length} of {plants.length} plants
              {selectedPlants.size > 0 && ` • ${selectedPlants.size} selected`}
            </div>
          </>
        )}
      </div>
      
      {/* Submit Error */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{submitError}</p>
        </div>
      )}
      
      {/* Cancel Button at bottom */}
      <div className="flex justify-start pb-8">
        <button
          onClick={() => router.push("/internal/customers")}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          ← Back to Customers
        </button>
      </div>
    </div>
  );
}
