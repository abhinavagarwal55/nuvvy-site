"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

// Types
interface Plant {
  id: string;
  name: string;
  scientific_name?: string | null;
  category?: string;
  light?: string;
  price_band?: string | null;
  thumbnail_url?: string;
  thumbnail_storage_url?: string;
  image_url?: string;
  image_storage_url?: string;
}

interface ShortlistItem {
  id: string;
  plant_id: string;
  quantity: number | null;
  note?: string | null;
  why_picked_for_balcony?: string | null;
  plant: Plant | null;
}

interface Shortlist {
  id: string;
  customer_uuid: string;
  title: string;
  description?: string | null;
  status: string;
  current_version_number?: number;
  created_at: string;
  updated_at: string;
}

interface Customer {
  id: string;
  name: string;
  phone_number: string;
  address: string;
  status: string;
}

interface ShortlistData {
  shortlist: Shortlist;
  customer: Customer | null;
  items: ShortlistItem[];
  has_unsent_changes?: boolean;
  latest_sent_version_number?: number;
  latest_submitted_version_number?: number;
  current_version_number?: number;
  showing_version_items?: boolean;
}

interface ItemFormData {
  id: string;
  plant_id: string;
  quantity: string;
  notes: string;
  quantityError?: string;
}

export default function ShortlistConfigurePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const shortlistId = resolvedParams.id;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShortlistData | null>(null);
  const [itemsData, setItemsData] = useState<Map<string, ItemFormData>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [isRevising, setIsRevising] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);
  const [wasUpdate, setWasUpdate] = useState(false);
  const [sentVersionNumber, setSentVersionNumber] = useState<number | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [versionData, setVersionData] = useState<ShortlistData | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Fetch shortlist data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/internal/shortlists/${shortlistId}`);
        const result = await response.json();

        if (!response.ok || result.error) {
          throw new Error(result.error || "Failed to fetch shortlist");
        }

        if (!result.data || !result.data.items || result.data.items.length === 0) {
          // No plants selected, redirect back to Step 1
          router.push(`/internal/shortlists/new?customerId=${result.data?.shortlist?.customer_uuid || ""}`);
          return;
        }

        setData(result.data);

        // Initialize form data
        const formDataMap = new Map<string, ItemFormData>();
        result.data.items.forEach((item: ShortlistItem) => {
          formDataMap.set(item.id, {
            id: item.id,
            plant_id: item.plant_id,
            quantity: item.quantity?.toString() || "",
            notes: item.note || "",
          });
        });
        setItemsData(formDataMap);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching shortlist:", err);
        setError(err instanceof Error ? err.message : "Failed to load shortlist");
        setLoading(false);
      }
    };

    fetchData();
  }, [shortlistId, router]);

  // Fetch version history
  useEffect(() => {
    const fetchVersions = async () => {
      setLoadingVersions(true);
      try {
        const response = await fetch(`/api/internal/shortlists/${shortlistId}/versions`);
        const result = await response.json();

        if (response.ok && result.data) {
          setVersions(result.data);
        }
      } catch (err) {
        console.error("Error fetching versions:", err);
      } finally {
        setLoadingVersions(false);
      }
    };

    if (shortlistId) {
      fetchVersions();
    }
  }, [shortlistId]);

  // Get thumbnail URL
  const getThumbnailUrl = (plant: Plant | null | undefined): string | null => {
    if (!plant) return null;
    return plant.thumbnail_storage_url || plant.thumbnail_url || plant.image_storage_url || plant.image_url || null;
  };

  // Parse price band to get min/max
  const parsePriceBand = (priceBand: string | null | undefined): { min: number; max: number } | null => {
    if (!priceBand) return null;

    // Expected format: "INR 350-500" or "INR 1000-1500"
    const match = priceBand.match(/INR\s*(\d+)-(\d+)/i);
    if (!match) return null;

    return {
      min: parseInt(match[1], 10),
      max: parseInt(match[2], 10),
    };
  };

  // Calculate estimated cost for a single item
  const calculateItemCost = (item: ShortlistItem, quantity: string): { min: number; max: number } | null => {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) return null;

    // Use price_band from plant relation
    const priceBandToUse = item.plant?.price_band;
    const priceRange = parsePriceBand(priceBandToUse);
    if (!priceRange) return null;

    return {
      min: priceRange.min * qty,
      max: priceRange.max * qty,
    };
  };

  // Calculate total estimated cost
  const calculateTotalCost = (): { min: number; max: number } | null => {
    if (!data) return null;

    let totalMin = 0;
    let totalMax = 0;
    let hasAnyPrice = false;

    data.items.forEach((item) => {
      const formData = itemsData.get(item.id);
      if (!formData) return;

      const cost = calculateItemCost(item, formData.quantity);
      if (cost) {
        totalMin += cost.min;
        totalMax += cost.max;
        hasAnyPrice = true;
      }
    });

    return hasAnyPrice ? { min: totalMin, max: totalMax } : null;
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return `₹${amount.toLocaleString("en-IN")}`;
  };

  // Update item data
  const updateItem = (itemId: string, updates: Partial<ItemFormData>) => {
    setItemsData((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(itemId);
      if (existing) {
        newMap.set(itemId, { ...existing, ...updates });
      }
      return newMap;
    });
  };

  // Remove item
  const handleRemoveItem = (itemId: string) => {
    if (!data) return;

    const updatedItems = data.items.filter((item) => item.id !== itemId);

    if (updatedItems.length === 0) {
      // No plants left, redirect to Step 1
      router.push(`/internal/shortlists/new?customerId=${data.shortlist.customer_uuid}`);
      return;
    }

    setData({
      ...data,
      items: updatedItems,
    });

    setItemsData((prev) => {
      const newMap = new Map(prev);
      newMap.delete(itemId);
      return newMap;
    });
  };

  // Validate form
  const validateForm = (): boolean => {
    let isValid = true;
    const newItemsData = new Map(itemsData);

    itemsData.forEach((item, itemId) => {
      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty < 1) {
        const updated = { ...item, quantityError: "Quantity is required (min: 1)" };
        newItemsData.set(itemId, updated);
        isValid = false;
      } else {
        const updated = { ...item, quantityError: undefined };
        newItemsData.set(itemId, updated);
      }
    });

    setItemsData(newItemsData);
    return isValid;
  };

  // Handle save
  const handleSave = async () => {
    setSaveSuccess(false);
    setSaveError(null);

    if (!validateForm()) {
      setSaveError("Please fix validation errors before saving");
      return;
    }

    setIsSaving(true);

    try {
      const items = Array.from(itemsData.values()).map((item) => ({
        id: item.id,
        quantity: parseInt(item.quantity, 10),
        notes: item.notes.trim() || null,
      }));

      const response = await fetch(`/api/internal/shortlists/${shortlistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to save shortlist");
      }

      // Update local state: increment current_version_number but keep latest_sent_version_number unchanged
      // This ensures has_unsent_changes remains true if it was true before
      // hasUnsentChanges = current_version_number > latest_sent_version_number
      if (data) {
        const currentVersion = data.shortlist.current_version_number || 0;
        const latestSentVersion = data.latest_sent_version_number || 0;
        const newCurrentVersion = currentVersion + 1;
        const updatedData = {
          ...data,
          shortlist: {
            ...data.shortlist,
            current_version_number: newCurrentVersion,
          },
          // Recompute has_unsent_changes based on version numbers ONLY
          has_unsent_changes: data.shortlist.status.toUpperCase() === "SENT_TO_CUSTOMER" 
            ? newCurrentVersion > latestSentVersion
            : data.has_unsent_changes,
        };
        setData(updatedData);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving shortlist:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save shortlist");
      setIsSaving(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle view current version - resets ALL historical state and reloads current draft items
  const handleViewCurrentVersion = async () => {
    // Essential: Clear all historical version state first
    setViewingVersion(null);
    setVersionData(null);
    setLoadingVersion(false);
    
    // Reload current data to ensure we have the latest draft items
    try {
      const response = await fetch(`/api/internal/shortlists/${shortlistId}`);
      const result = await response.json();

      if (response.ok && result.data) {
        // Essential: Reset main data state with current draft items
        setData(result.data);
        
        // Essential: Reinitialize form data from current draft items (not version items)
        const formDataMap = new Map<string, ItemFormData>();
        result.data.items.forEach((item: ShortlistItem) => {
          formDataMap.set(item.id, {
            id: item.id,
            plant_id: item.plant_id,
            quantity: item.quantity?.toString() || "",
            notes: item.note || "",
          });
        });
        setItemsData(formDataMap);
      }
    } catch (err) {
      console.error("Error reloading current data:", err);
      alert("Failed to load current version");
    }
  };

  // Handle view historical version - loads snapshot for read-only viewing
  const handleViewVersion = async (versionNumber: number) => {
    const currentVersion = data?.shortlist.current_version_number || 0;
    
    // If viewing current version, use the current version handler instead
    if (versionNumber === currentVersion) {
      await handleViewCurrentVersion();
      return;
    }
    
    // Essential: Set viewing state before loading
    setViewingVersion(versionNumber);
    setLoadingVersion(true);
    
    try {
      const response = await fetch(`/api/internal/shortlists/${shortlistId}/versions/${versionNumber}`);
      const result = await response.json();
      
      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to load version");
      }
      
      if (result.data) {
        // Transform version data to match ShortlistData format
        const versionShortlistData: ShortlistData = {
          shortlist: {
            ...data!.shortlist,
            current_version_number: versionNumber,
          },
          customer: data!.customer,
          items: result.data.items || [],
          has_unsent_changes: false,
          latest_sent_version_number: versionNumber,
          current_version_number: versionNumber,
        };
        
        // Essential: Set version data (this is what activeItems will use)
        setVersionData(versionShortlistData);
        
        // Essential: Initialize form data from version snapshot items (read-only)
        const formDataMap = new Map<string, ItemFormData>();
        result.data.items.forEach((item: any) => {
          formDataMap.set(item.id, {
            id: item.id,
            plant_id: item.plant_id,
            quantity: item.quantity?.toString() || "",
            notes: item.note || "",
          });
        });
        setItemsData(formDataMap);
      }
    } catch (err) {
      console.error("Error loading version:", err);
      alert(err instanceof Error ? err.message : "Failed to load version");
      // Essential: Reset state on error
      setViewingVersion(null);
      setVersionData(null);
    } finally {
      setLoadingVersion(false);
    }
  };

  // Handle copy link for version
  const handleCopyVersionLink = async (shortlistId: string) => {
    try {
      const response = await fetch(`/api/internal/shortlists/${shortlistId}/link`);
      const result = await response.json();
      
      if (response.ok && result.data?.publicUrl) {
        await navigator.clipboard.writeText(result.data.publicUrl);
        alert("Link copied to clipboard!");
      } else {
        throw new Error(result.error || "Failed to get link");
      }
    } catch (err) {
      console.error("Error copying link:", err);
      alert("Failed to copy link");
    }
  };

  // Format status for display
  const formatVersionStatus = (status: string) => {
    const upperStatus = status.toUpperCase();
    switch (upperStatus) {
      case "SENT_TO_CUSTOMER":
        return "Sent to customer";
      case "CUSTOMER_SUBMITTED":
        return "Customer Submitted";
      case "DRAFT":
        return "Draft";
      case "SENT_BACK_TO_CUSTOMER":
        return "Sent Back to Customer";
      case "TO_BE_PROCURED":
        return "To Be Procured";
      default:
        return status;
    }
  };

  // Get status badge with prominent styling
  const getStatusBadge = (status: string, hasUnsentChanges?: boolean) => {
    const upperStatus = status.toUpperCase();
    let badge;
    switch (upperStatus) {
      case "DRAFT":
        badge = (
          <span className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-full">
            Draft
          </span>
        );
        break;
      case "SENT_TO_CUSTOMER":
        badge = (
          <span className="px-3 py-1.5 text-sm font-semibold text-green-700 bg-green-100 rounded-full">
            Sent to Customer
          </span>
        );
        break;
      case "CUSTOMER_SUBMITTED":
        badge = (
          <span className="px-3 py-1.5 text-sm font-semibold text-blue-700 bg-blue-100 rounded-full">
            Customer Submitted
          </span>
        );
        break;
      case "SENT_BACK_TO_CUSTOMER":
        badge = (
          <span className="px-3 py-1.5 text-sm font-semibold text-yellow-700 bg-yellow-100 rounded-full">
            Sent Back to Customer
          </span>
        );
        break;
      case "TO_BE_PROCURED":
        badge = (
          <span className="px-3 py-1.5 text-sm font-semibold text-purple-700 bg-purple-100 rounded-full">
            To Be Procured
          </span>
        );
        break;
      default:
        badge = (
          <span className="px-3 py-1.5 text-sm font-semibold text-gray-500 bg-gray-50 rounded-full">
            {status}
          </span>
        );
    }

    // Add unsent changes indicator
    if (upperStatus === "SENT_TO_CUSTOMER" && hasUnsentChanges) {
      return (
        <div className="flex items-center gap-2">
          {badge}
          <span className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full">
            Updated (not sent)
          </span>
        </div>
      );
    }

    return badge;
  };

  // Format date
  const formatVersionDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Handle revise
  const handleRevise = async () => {
    setReviseError(null);
    setIsRevising(true);
    try {
      const response = await fetch(`/api/internal/shortlists/${shortlistId}/revise`, {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to revise shortlist");
      }

      // Refresh the page data to show updated draft items
      window.location.reload();
    } catch (err) {
      console.error("Error revising shortlist:", err);
      setReviseError(err instanceof Error ? err.message : "Failed to revise shortlist");
      setIsRevising(false);
    }
  };

  // Handle send to customer
  const handlePublish = async () => {
    setPublishError(null);
    setPublicUrl(null);

    // First save any pending changes
    if (!validateForm()) {
      setPublishError("Please fix validation errors before publishing");
      return;
    }

    // Save draft first
    setIsSaving(true);
    try {
      const items = Array.from(itemsData.values()).map((item) => ({
        id: item.id,
        quantity: parseInt(item.quantity, 10),
        notes: item.notes.trim() || null,
      }));

      const saveResponse = await fetch(`/api/internal/shortlists/${shortlistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const saveResult = await saveResponse.json();

      if (!saveResponse.ok || saveResult.error) {
        throw new Error(saveResult.error || "Failed to save shortlist before publishing");
      }
    } catch (err) {
      console.error("Error saving before publish:", err);
      setPublishError(err instanceof Error ? err.message : "Failed to save shortlist");
      setIsSaving(false);
      return;
    } finally {
      setIsSaving(false);
    }

    // Now send to customer
    setIsPublishing(true);
    // Check if this is an update (status is already SENT_TO_CUSTOMER with unsent changes)
    const isUpdate = data && data.shortlist.status.toUpperCase() === "SENT_TO_CUSTOMER" && data.has_unsent_changes;
    setWasUpdate(isUpdate || false);
    
    try {
      const response = await fetch(`/api/internal/shortlists/${shortlistId}/publish`, {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to send shortlist to customer");
      }

      // Store the public URL and version number if provided
      if (result.data?.publicUrl) {
        setPublicUrl(result.data.publicUrl);
      }
      if (result.data?.version_number) {
        setSentVersionNumber(result.data.version_number);
      }

      // Refresh data to update has_unsent_changes and version numbers
      const refreshResponse = await fetch(`/api/internal/shortlists/${shortlistId}`);
      const refreshResult = await refreshResponse.json();
      if (refreshResult.data) {
        // After sending, latest_sent_version_number should equal current_version_number
        // Update local state to reflect this immediately
        const updatedData = {
          ...refreshResult.data,
          has_unsent_changes: false, // Explicitly clear unsent changes after successful send
          latest_sent_version_number: refreshResult.data.shortlist.current_version_number || refreshResult.data.latest_sent_version_number,
        };
        setData(updatedData);
      }
    } catch (err) {
      console.error("Error sending shortlist to customer:", err);
      setPublishError(err instanceof Error ? err.message : "Failed to send shortlist to customer");
    } finally {
      setIsPublishing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Loading shortlist...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configure Shortlist</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || "Failed to load shortlist"}</p>
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

  // Derive active items - use version data if viewing historical, otherwise use current data
  const activeItems = viewingVersion !== null && versionData 
    ? versionData.items 
    : data?.items || [];

  // Calculate total cost from active items only
  const totalCost = (() => {
    if (activeItems.length === 0) return null;

    let totalMin = 0;
    let totalMax = 0;
    let hasAnyPrice = false;

    activeItems.forEach((item) => {
      const formData = itemsData.get(item.id);
      if (!formData) return;

      const cost = calculateItemCost(item, formData.quantity);
      if (cost) {
        totalMin += cost.min;
        totalMax += cost.max;
        hasAnyPrice = true;
      }
    });

    return hasAnyPrice ? { min: totalMin, max: totalMax } : null;
  })();

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Configure Shortlist - Step 2
          </h1>
          {data && getStatusBadge(data.shortlist.status, data.has_unsent_changes)}
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Set quantity and add notes for each selected plant
        </p>
      </div>

      {/* Shortlist & Customer Info */}
      <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200">
        <div className="space-y-3">
          <div>
            <span className="text-sm font-medium text-gray-700">Shortlist: </span>
            <span className="text-sm text-gray-900 font-semibold">{(viewingVersion !== null && versionData ? versionData.shortlist : data?.shortlist)?.title}</span>
          </div>
          {!viewingVersion && data && (data.shortlist.status.toUpperCase() === "SENT_TO_CUSTOMER" || data.shortlist.status.toUpperCase() === "CUSTOMER_SUBMITTED") && (
            <div>
              <span className="text-xs text-gray-600">
                Customer is viewing{" "}
                <span className="font-medium">
                  v{data.latest_submitted_version_number || data.latest_sent_version_number || 0}
                </span>
                {data.has_unsent_changes && (
                  <>
                    {" "}·{" "}
                    <span className="text-amber-600">You are editing a newer draft</span>
                  </>
                )}
                {data.showing_version_items && data.latest_submitted_version_number && (
                  <>
                    {" "}·{" "}
                    <span className="text-blue-600">Showing submitted version</span>
                  </>
                )}
              </span>
            </div>
          )}
          {viewingVersion !== null && (
            <div>
              <span className="text-xs text-gray-600">
                Viewing historical snapshot from{" "}
                <span className="font-medium">{formatVersionDate(versions.find(v => v.version_number === viewingVersion)?.created_at || "")}</span>
              </span>
            </div>
          )}
          {(viewingVersion !== null && versionData ? versionData.customer : data?.customer) && (
            <>
              <div>
                <span className="text-sm font-medium text-gray-700">Customer: </span>
                <span className="text-sm text-gray-900">{(viewingVersion !== null && versionData ? versionData.customer : data?.customer)?.name}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Address: </span>
                <span className="text-sm text-gray-900">{(viewingVersion !== null && versionData ? versionData.customer : data?.customer)?.address}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Success Banner */}
      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">✓ Shortlist saved successfully!</p>
        </div>
      )}

      {/* Error Banner */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{saveError}</p>
        </div>
      )}

      {/* Publish Error Banner */}
      {publishError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{publishError}</p>
        </div>
      )}

      {/* Revise Error Banner */}
      {reviseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{reviseError}</p>
        </div>
      )}

      {/* Unsent Changes Warning Banner */}
      {data && data.shortlist.status.toUpperCase() === "SENT_TO_CUSTOMER" && data.has_unsent_changes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-800">
            You have unsent changes. Customers are still seeing the previous version.
          </p>
        </div>
      )}

      {/* Read-only Version Banner */}
      {viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-blue-800">
              Viewing version v{viewingVersion} (read-only). This is a historical snapshot.
            </p>
            <button
              onClick={handleViewCurrentVersion}
              className="px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-md hover:bg-blue-50"
            >
              View Current Version
            </button>
          </div>
        </div>
      )}

      {/* Success Banner with Public URL */}
      {publicUrl && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <p className="text-green-800 font-medium">
            {sentVersionNumber
              ? `✓ Version v${sentVersionNumber} sent to customer`
              : wasUpdate
              ? "✓ Updated version sent to customer"
              : "✓ Shortlist sent to customer successfully!"}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer Link:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-gray-900"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl);
                    // Show temporary feedback
                    const btn = document.activeElement as HTMLButtonElement;
                    const originalText = btn.textContent;
                    btn.textContent = "Copied!";
                    setTimeout(() => {
                      btn.textContent = originalText;
                    }, 2000);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Copy link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Version History Section */}
      {versions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Version History</h2>
                {!showVersionHistory && (
                  <p className="text-sm text-gray-600 mt-1">
                    {versions.length} version{versions.length !== 1 ? "s" : ""} available
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowVersionHistory(!showVersionHistory)}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-300 rounded-md hover:bg-blue-50"
              >
                {showVersionHistory ? "Hide history" : "View version history"}
              </button>
            </div>
          </div>
          {showVersionHistory && (
            <div className="divide-y divide-gray-200">
              {versions.map((version) => (
              <div
                key={version.id}
                className={`p-4 md:p-6 ${
                  version.is_current ? "bg-blue-50" : "bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-gray-900">
                          v{version.version_number}
                        </span>
                        {version.is_current && (
                          <span className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full">
                            (current)
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        {formatVersionStatus(version.status_at_time)}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {formatVersionDate(version.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {version.status_at_time === "SENT_TO_CUSTOMER" && version.has_public_link && (
                      <>
                        {/* For current version, use handleViewCurrentVersion; for historical, use handleViewVersion */}
                        <button
                          onClick={() => version.is_current 
                            ? handleViewCurrentVersion() 
                            : handleViewVersion(version.version_number)}
                          className="px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-300 rounded-md hover:bg-blue-50"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleCopyVersionLink(shortlistId)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          Copy link
                        </button>
                      </>
                    )}
                    {version.is_current && !version.has_public_link && (
                      <button
                        onClick={handleViewCurrentVersion}
                        className="px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-300 rounded-md hover:bg-blue-50"
                      >
                        View Current
                      </button>
                    )}
                    {version.is_current && version.status_at_time !== "SENT_TO_CUSTOMER" && (
                      <span className="text-sm text-gray-500">Currently editing</span>
                    )}
                  </div>
                </div>
              </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Configure Plants Table */}
      {loadingVersion ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">Loading version...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Configure Selected Plants</h2>
            <p className="text-sm text-gray-600 mt-1">
              {activeItems.length} plant{activeItems.length !== 1 ? "s" : ""} selected
            </p>
          </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Plant
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Price Band
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Quantity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Estimated Cost
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Notes
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activeItems.map((item) => {
                const formData = itemsData.get(item.id);
                if (!formData) return null;

                const itemCost = calculateItemCost(item, formData.quantity);

                return (
                  <tr key={item.id}>
                    {/* Plant */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {item.plant && getThumbnailUrl(item.plant) && (
                          <div className="flex-shrink-0">
                            <Image
                              src={getThumbnailUrl(item.plant) || ""}
                              alt={item.plant.name}
                              width={40}
                              height={40}
                              className="rounded object-cover"
                            />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {item.plant?.name || "Unknown Plant"}
                          </div>
                          <div className="text-xs text-gray-500 italic">
                            {item.plant?.scientific_name || ""}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Price Band */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {item.plant?.price_band || "—"}
                      </span>
                    </td>

                    {/* Quantity */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div>
                        <input
                          type="number"
                          min="1"
                          value={formData.quantity}
                          readOnly={viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0)}
                          disabled={viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0)}
                          onChange={(e) =>
                            updateItem(item.id, { quantity: e.target.value })
                          }
                          className={`w-20 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            formData.quantityError
                              ? "border-red-500"
                              : "border-gray-300"
                          }`}
                        />
                        {formData.quantityError && (
                          <p className="mt-1 text-xs text-red-600">
                            {formData.quantityError}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Estimated Cost */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {itemCost
                          ? `${formatCurrency(itemCost.min)} – ${formatCurrency(itemCost.max)}`
                          : "—"}
                      </span>
                    </td>

                    {/* Notes */}
                    <td className="px-4 py-4">
                      <textarea
                        rows={2}
                        value={formData.notes}
                        readOnly={viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0)}
                        disabled={viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0)}
                        onChange={(e) =>
                          updateItem(item.id, { notes: e.target.value })
                        }
                        placeholder="Care notes, selection reasons..."
                        className="w-full min-w-[200px] px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-gray-200">
          {activeItems.map((item) => {
            const formData = itemsData.get(item.id);
            if (!formData) return null;

                const itemCost = calculateItemCost(item, formData.quantity);

            return (
              <div key={item.id} className="p-4 space-y-3">
                {/* Plant Info */}
                <div className="flex items-start gap-3">
                  {item.plant && getThumbnailUrl(item.plant) && (
                    <div className="flex-shrink-0">
                      <Image
                        src={getThumbnailUrl(item.plant) || ""}
                        alt={item.plant.name}
                        width={60}
                        height={60}
                        className="rounded object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-gray-900">
                      {item.plant?.name || "Unknown Plant"}
                    </h3>
                    <p className="text-sm text-gray-600 italic">
                      {item.plant?.scientific_name || ""}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.plant?.price_band || "Price not set"}
                    </p>
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.quantity}
                    readOnly={viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0)}
                    disabled={viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0)}
                    onChange={(e) =>
                      updateItem(item.id, { quantity: e.target.value })
                    }
                    className={`w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      formData.quantityError
                        ? "border-red-500"
                        : "border-gray-300"
                    }`}
                  />
                  {formData.quantityError && (
                    <p className="mt-1 text-xs text-red-600">
                      {formData.quantityError}
                    </p>
                  )}
                </div>

                {/* Estimated Cost */}
                {itemCost && (
                  <div>
                    <span className="text-xs font-medium text-gray-700">
                      Estimated: 
                    </span>
                    <span className="text-sm text-gray-900 ml-2">
                      {formatCurrency(itemCost.min)} – {formatCurrency(itemCost.max)}
                    </span>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={formData.notes}
                    readOnly={viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0)}
                    disabled={viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0)}
                    onChange={(e) =>
                      updateItem(item.id, { notes: e.target.value })
                    }
                    placeholder="Care notes, selection reasons..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Remove */}
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Remove plant
                </button>
              </div>
            );
          })}
        </div>

        {/* Total Cost */}
        {totalCost && (() => {
          const midpoint = Math.round((totalCost.min + totalCost.max) / 2);
          return (
            <div className="px-4 md:px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  Estimated Total Cost:
                </span>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-lg font-bold text-gray-900">
                    {formatCurrency(midpoint)}
                  </span>
                  <span className="text-xs text-gray-600">
                    The final invoice amount can vary between {formatCurrency(totalCost.min)} and {formatCurrency(totalCost.max)}.
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
        </div>
      )}

      {/* Sticky Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 z-20">
        <div className="bg-white border-t border-gray-200 p-4 shadow-lg">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:justify-between gap-4 relative z-30">
          {/* Ensure buttons are above footer background */}
          <div className="relative z-30 w-full sm:w-auto">
            {/* Back button - left side on desktop, first on mobile */}
            <button
              onClick={() => router.push(`/internal/shortlists/new?customerId=${data.shortlist.customer_uuid}&shortlistId=${data.shortlist.id}`)}
              disabled={isSaving || isPublishing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 w-full sm:w-auto relative z-30"
            >
              ← Back to plant selection
            </button>
          </div>
          {/* Right group: Save Draft + Send/Revise - grouped on desktop, stacked on mobile */}
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto relative z-30">
            <button
              onClick={handleSave}
              disabled={isSaving || isPublishing || isRevising || (viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0))}
              className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto relative z-30"
            >
              {isSaving ? "Saving..." : "Save Draft"}
            </button>
            {data && (data.shortlist.status.toUpperCase() === "DRAFT" || data.shortlist.status.toUpperCase() === "SENT_BACK_TO_CUSTOMER") && (
              <button
                onClick={handlePublish}
                disabled={isSaving || isPublishing || isRevising || (viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0))}
                className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto relative z-30"
              >
                {isPublishing ? "Sending..." : "Send to Customer"}
              </button>
            )}
            {data && data.shortlist.status.toUpperCase() === "SENT_TO_CUSTOMER" && data.has_unsent_changes && (
              <button
                onClick={handlePublish}
                disabled={isSaving || isPublishing || isRevising || (viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0))}
                className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto relative z-30"
              >
                {isPublishing ? "Sending..." : "Send Update to Customer"}
              </button>
            )}
            {data && data.shortlist.status.toUpperCase() === "SENT_TO_CUSTOMER" && !data.has_unsent_changes && (
              <button
                onClick={handleRevise}
                disabled={isSaving || isPublishing || isRevising || (viewingVersion !== null && viewingVersion !== (data?.shortlist.current_version_number || 0))}
                className="px-6 py-3 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto relative z-30"
              >
                {isRevising ? "Revising..." : "Revise"}
              </button>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
