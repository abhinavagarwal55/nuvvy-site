"use client";

/**
 * Manual Testing Notes:
 * - Try adding a plant with same name differing only in case/whitespace (e.g., "Snake Plant" vs " snake plant ") → should be blocked with inline error.
 * - Try adding a truly new name → should succeed.
 */

import { useState, useEffect, useCallback, useRef, useMemo, type RefObject, type MouseEventHandler } from "react";
import { PLANT_CATEGORIES, LIGHT_CONDITIONS } from "@/config/plantOptions";
import { PLANT_FIELD_DEFS, DEFAULT_VISIBLE_COLUMNS, INITIAL_VISIBLE_COLUMNS } from "@/lib/internal/plants/plantFields";

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
  created_at?: string;
  updated_at?: string;
  thumbnail_url?: string;
  thumbnail_storage_url?: string;
  image_url?: string;
  image_storage_url?: string;
}

interface PlantsResponse {
  data: Plant[] | null;
  totalCount?: number;
  error: string | null;
}

interface PlantFormData {
  name: string;
  scientific_name: string;
  category: string;
  light: string;
  watering_requirement: string;
  fertilization_requirement: string;
  soil_mix: string;
  toxicity: string;
  lifespan: string;
  horticulturist_notes: string;
  can_be_procured: boolean;
  image: File | null;
}

// Scrollable fields exclude can_be_procured (checkbox doesn't need scrolling)
type ScrollableField = Exclude<keyof PlantFormData, "can_be_procured">;

export default function PlantsPage() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [publishedFilter, setPublishedFilter] = useState<"all" | "published" | "non-published">("all");
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingPlantId, setEditingPlantId] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState<PlantFormData>({
    name: "",
    scientific_name: "",
    category: "",
    light: "",
    watering_requirement: "",
    fertilization_requirement: "",
    soil_mix: "",
    toxicity: "",
    lifespan: "",
    horticulturist_notes: "",
    can_be_procured: false,
    image: null,
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof PlantFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [deletingPlantId, setDeletingPlantId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Sorting state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  
  // Column visibility state - initialize with defaults
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    // Start with all fields from INITIAL_VISIBLE_COLUMNS, but override with DEFAULT_VISIBLE_COLUMNS
    return { ...INITIAL_VISIBLE_COLUMNS, ...DEFAULT_VISIBLE_COLUMNS };
  });
  const [isColumnsPopoverOpen, setIsColumnsPopoverOpen] = useState(false);

  // Refs for scrolling to validation errors
  const modalContentRef = useRef<HTMLDivElement>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);
  
  // Individual properly typed refs for JSX elements
  const nameRef = useRef<HTMLInputElement>(null);
  const scientific_nameRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const lightRef = useRef<HTMLSelectElement>(null);
  const watering_requirementRef = useRef<HTMLTextAreaElement>(null);
  const fertilization_requirementRef = useRef<HTMLTextAreaElement>(null);
  const soil_mixRef = useRef<HTMLTextAreaElement>(null);
  const toxicityRef = useRef<HTMLInputElement>(null);
  const lifespanRef = useRef<HTMLInputElement>(null);
  const horticulturist_notesRef = useRef<HTMLTextAreaElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  
  // Map of refs for scroll-to-first-error logic (all as HTMLElement)
  const scrollRefs: Record<ScrollableField, RefObject<HTMLElement | null>> = {
    name: nameRef,
    scientific_name: scientific_nameRef,
    category: categoryRef,
    light: lightRef,
    watering_requirement: watering_requirementRef,
    fertilization_requirement: fertilization_requirementRef,
    soil_mix: soil_mixRef,
    toxicity: toxicityRef,
    lifespan: lifespanRef,
    horticulturist_notes: horticulturist_notesRef,
    image: imageRef,
  };

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setLimit(25); // Reset limit when search changes
      setOffset(0); // Reset offset when search changes
      setShowAll(false); // Reset show all when search changes
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);


  // Fetch plants
  const fetchPlants = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Determine limit: if showAll is true, fetch with a large limit (we'll use totalCount after first fetch)
      // Otherwise use the current limit
      // For first fetch, we don't know totalCount yet, so use limit
      const effectiveLimit = showAll ? (totalCount > 0 ? totalCount : 10000) : limit;
      
      const params = new URLSearchParams({
        limit: effectiveLimit.toString(),
        offset: offset.toString(),
        ...(debouncedQuery && { q: debouncedQuery }),
        published: publishedFilter === "all" ? "all" : publishedFilter === "published" ? "published" : "non_published",
        ...(sortKey && { sort: sortKey }),
        ...(sortDir && { dir: sortDir }),
      });

      const response = await fetch(`/api/internal/plants?${params}`);
      const json: PlantsResponse = await response.json();

      if (!response.ok || json.error) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }

      setPlants(json.data || []);
      // Update totalCount from API response (this is the real total matching filters)
      if (typeof json.totalCount === "number") {
        setTotalCount(json.totalCount);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch plants");
      setPlants([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, publishedFilter, limit, offset, showAll, totalCount, sortKey, sortDir]);

  useEffect(() => {
    fetchPlants();
  }, [fetchPlants]);

  // Reset pagination when published filter changes
  useEffect(() => {
    setLimit(25);
    setOffset(0);
    setShowAll(false);
  }, [publishedFilter]);

  // Load sort state from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("nuvvy_internal_plants_sort_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && "key" in parsed && "dir" in parsed) {
          const validKeys = ["name", "category", "light", "watering_requirement", "can_be_procured", "updated_at"];
          const validDirs = ["asc", "desc"];
          if (validKeys.includes(parsed.key) && (validDirs.includes(parsed.dir) || parsed.dir === null)) {
            setSortKey(parsed.key);
            setSortDir(parsed.dir);
          }
        }
      }
    } catch (err) {
      // Invalid localStorage data, ignore
    }
  }, []);

  // Save sort state to localStorage when it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sortKey && sortDir) {
        localStorage.setItem("nuvvy_internal_plants_sort_v1", JSON.stringify({ key: sortKey, dir: sortDir }));
      } else {
        localStorage.removeItem("nuvvy_internal_plants_sort_v1");
      }
    } catch (err) {
      // localStorage unavailable, ignore
    }
  }, [sortKey, sortDir]);

  // Load column visibility from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("nuvvy_internal_plants_columns_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          // Validate and merge with defaults
          const validKeys = PLANT_FIELD_DEFS.map((f) => f.key);
          const merged = { ...INITIAL_VISIBLE_COLUMNS, ...DEFAULT_VISIBLE_COLUMNS };
          for (const key of validKeys) {
            if (key in parsed && typeof parsed[key] === "boolean") {
              // Required columns cannot be turned off
              const fieldDef = PLANT_FIELD_DEFS.find((f) => f.key === key);
              if (fieldDef?.requiredInTable) {
                merged[key] = true;
              } else {
                merged[key] = parsed[key];
              }
            }
          }
          setVisibleColumns(merged);
        }
      }
    } catch (err) {
      // Invalid localStorage data, ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save column visibility to localStorage when it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("nuvvy_internal_plants_columns_v1", JSON.stringify(visibleColumns));
    } catch (err) {
      // localStorage unavailable, ignore
    }
  }, [visibleColumns]);

  // Clear sorting if the active sort column is hidden
  useEffect(() => {
    if (sortKey) {
      const columnKeyMap: Record<string, string> = {
        name: "name",
        category: "category",
        light: "light",
        watering_requirement: "watering_requirement",
        can_be_procured: "published",
        updated_at: "updated_at",
        created_at: "created_at",
      };
      const visibleKey = columnKeyMap[sortKey];
      if (visibleKey && !visibleColumns[visibleKey]) {
        setSortKey(null);
        setSortDir(null);
      }
    }
  }, [visibleColumns, sortKey]);

  // Check for deleted query param and show success message
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const deleted = params.get("deleted");
    if (deleted === "1") {
      setDeleteMessage({
        type: "success",
        text: "Plant deleted successfully.",
      });
      // Clear the query param
      window.history.replaceState({}, "", "/internal/plants");
      // Clear message after 3 seconds
      setTimeout(() => {
        setDeleteMessage(null);
      }, 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for edit query param and open modal
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId && plants.length > 0 && !isModalOpen) {
      const plantToEdit = plants.find((p) => p.id === editId);
      if (plantToEdit) {
        handleOpenModal(plantToEdit);
        // Clean up URL
        window.history.replaceState({}, "", "/internal/plants");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plants, isModalOpen]);

  // Check for modal=add query param and open Add Plant modal
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const modalParam = params.get("modal");
    if (modalParam === "add" && !isModalOpen) {
      handleOpenModal();
      // Clean up URL
      window.history.replaceState({}, "", "/internal/plants");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  const handleLoadMore = () => {
    setLimit((prev) => Math.min(prev + 50, 200));
  };

  const handleShowAll = () => {
    if (totalCount > 0) {
      setShowAll(true);
      // Set limit to totalCount to fetch all rows
      setLimit(totalCount);
      setOffset(0);
    }
  };

  // Sorting function
  const applySort = (plantsToSort: Plant[], key: string | null, dir: "asc" | "desc" | null): Plant[] => {
    if (!key || !dir) {
      return [...plantsToSort];
    }

    const sorted = [...plantsToSort].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (key) {
        case "name":
          aVal = (a.name || "").trim().toLowerCase();
          bVal = (b.name || "").trim().toLowerCase();
          return aVal.localeCompare(bVal) * (dir === "asc" ? 1 : -1);
        
        case "category":
          aVal = (a.category || "").trim().toLowerCase();
          bVal = (b.category || "").trim().toLowerCase();
          return aVal.localeCompare(bVal) * (dir === "asc" ? 1 : -1);
        
        case "light":
          aVal = (a.light || "").trim().toLowerCase();
          bVal = (b.light || "").trim().toLowerCase();
          return aVal.localeCompare(bVal) * (dir === "asc" ? 1 : -1);
        
        case "watering_requirement":
          aVal = (a.watering_requirement || "").trim().toLowerCase();
          bVal = (b.watering_requirement || "").trim().toLowerCase();
          return aVal.localeCompare(bVal) * (dir === "asc" ? 1 : -1);
        
        case "can_be_procured":
          // Boolean: false < true (No < Yes)
          aVal = a.can_be_procured === true ? 1 : 0;
          bVal = b.can_be_procured === true ? 1 : 0;
          return (aVal - bVal) * (dir === "asc" ? 1 : -1);
        
        case "updated_at":
        case "created_at":
          // Date sorting: nulls last
          const dateKey = key as "updated_at" | "created_at";
          if (!a[dateKey] && !b[dateKey]) return 0;
          if (!a[dateKey]) return 1;
          if (!b[dateKey]) return -1;
          aVal = new Date(a[dateKey]!).getTime();
          bVal = new Date(b[dateKey]!).getTime();
          return (aVal - bVal) * (dir === "asc" ? 1 : -1);
        
        default:
          return 0;
      }
    });

    return sorted;
  };

  // Plants are already filtered and sorted by the API
  // Use plants directly (no client-side filtering/sorting needed)
  const displayPlants = plants;

  // Handle column header click
  const handleSort = (key: string) => {
    if (sortKey === key) {
      // Toggle: asc -> desc -> null
      if (sortDir === "asc") {
        setSortDir("desc");
      } else if (sortDir === "desc") {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      // New column: start with asc
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Check if column is sortable
  const isSortable = (key: string): boolean => {
    const sortableKeys = ["name", "category", "light", "can_be_procured", "updated_at", "created_at"];
    return sortableKeys.includes(key);
  };

  // Get sort indicator
  const getSortIndicator = (key: string): string => {
    if (sortKey !== key || !sortDir) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  // Column visibility handlers
  const handleToggleColumn = (key: string) => {
    // Required columns cannot be toggled
    const fieldDef = PLANT_FIELD_DEFS.find((f) => f.key === key);
    if (fieldDef?.requiredInTable) {
      return;
    }
    setVisibleColumns((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleResetColumns = () => {
    setVisibleColumns({ ...INITIAL_VISIBLE_COLUMNS, ...DEFAULT_VISIBLE_COLUMNS });
  };

  // Helper to truncate long text
  const truncateText = (text: string | null | undefined, maxLength: number = 40): string => {
    if (!text) return "-";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const visibleColumnsCount = Object.values(visibleColumns).filter(Boolean).length;

  const handleDeletePlant = async (plant: Plant) => {
    const confirmed = window.confirm(
      `Delete plant "${plant.name}"? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingPlantId(plant.id);
    setDeleteMessage(null);

    // If the plant being deleted is currently being edited, close the modal
    if (editingPlantId === plant.id && isModalOpen) {
      handleCloseModal();
    }

    try {
      const response = await fetch(`/api/internal/plants/${plant.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to delete plant");
      }

      // Success: show message and refresh list
      setDeleteMessage({
        type: "success",
        text: `Plant "${plant.name}" deleted successfully.`,
      });

      // Refresh the plants list
      await fetchPlants();

      // Clear message after 3 seconds
      setTimeout(() => {
        setDeleteMessage(null);
      }, 3000);
    } catch (err) {
      console.error("Error deleting plant:", err);
      setDeleteMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete plant",
      });

      // Clear error message after 5 seconds
      setTimeout(() => {
        setDeleteMessage(null);
      }, 5000);
    } finally {
      setDeletingPlantId(null);
    }
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

  const handleOpenModal = (plant?: Plant) => {
    if (plant) {
      // Edit mode
      setModalMode("edit");
      setEditingPlantId(plant.id);
      setFormData({
        name: plant.name || "",
        scientific_name: plant.scientific_name || "",
        category: plant.category || "",
        light: plant.light || "",
        watering_requirement: plant.watering_requirement || "",
        fertilization_requirement: plant.fertilization_requirement || "",
        soil_mix: plant.soil_mix || "",
        toxicity: plant.toxicity || "",
        lifespan: plant.lifespan || "",
        horticulturist_notes: plant.horticulturist_notes || "",
        can_be_procured: plant.can_be_procured || false,
        image: null, // New image (optional in edit mode)
      });
      // Set existing image URL for preview
      const existingUrl = plant.image_storage_url || plant.image_url || plant.thumbnail_storage_url || plant.thumbnail_url || null;
      setExistingImageUrl(existingUrl);
    } else {
      // Create mode
      setModalMode("create");
      setEditingPlantId(null);
      setExistingImageUrl(null);
      setFormData({
        name: "",
        scientific_name: "",
        category: "",
        light: "",
        watering_requirement: "",
        fertilization_requirement: "",
        soil_mix: "",
        toxicity: "",
        lifespan: "",
        horticulturist_notes: "",
        can_be_procured: false,
        image: null,
      });
    }
    setFormErrors({});
    setSubmitError(null);
    setSubmitSuccess(false);
    setIsModalOpen(true);
  };

  const handleAddPlantClick: MouseEventHandler<HTMLButtonElement> = () => {
    handleOpenModal();
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalMode("create");
    setEditingPlantId(null);
    setExistingImageUrl(null);
    setFormData({
      name: "",
      scientific_name: "",
      category: "",
      light: "",
      watering_requirement: "",
      fertilization_requirement: "",
      soil_mix: "",
      toxicity: "",
      lifespan: "",
      horticulturist_notes: "",
      can_be_procured: false,
      image: null,
    });
    setFormErrors({});
    setSubmitError(null);
    setSubmitSuccess(false);
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    const errors: Partial<Record<keyof PlantFormData, string>> = { ...formErrors };
    
    if (file) {
      // Validate file type
      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (!validTypes.includes(file.type)) {
        errors.image = "Image must be JPG, PNG, or WebP";
      } else {
        delete errors.image;
      }
      
      // Validate file size (8MB max)
      const maxSize = 8 * 1024 * 1024; // 8MB in bytes
      if (file.size > maxSize) {
        errors.image = "Image must be smaller than 8MB";
      } else if (!errors.image) {
        delete errors.image;
      }
    } else {
      delete errors.image;
    }
    
    setFormErrors(errors);
    setFormData((prev) => ({ ...prev, image: file }));
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof PlantFormData, string>> = {};
    
    if (!formData.name.trim()) {
      errors.name = "Name is required";
    } else {
      // Check for duplicate names (case-insensitive, trimmed)
      // Check against ALL plants currently loaded in memory (regardless of filters/search)
      // Only check if plants list has been loaded (loading === false)
      if (plants.length > 0 || !loading) {
        const normalizedName = formData.name.trim().toLowerCase();
        const duplicateExists = plants.some(
          (plant) => 
            plant.id !== editingPlantId && // Allow same plant's existing name
            plant.name.trim().toLowerCase() === normalizedName
        );
        
        if (duplicateExists) {
          errors.name = "A plant with this name already exists.";
        }
      }
      // If plants list hasn't loaded yet (loading === true), allow submit
      // (validation will happen server-side if needed, but no DB constraint exists)
    }
    
    if (!formData.scientific_name.trim()) {
      errors.scientific_name = "Scientific name is required";
    }
    
    if (!formData.category) {
      errors.category = "Category is required";
    }
    
    if (!formData.light) {
      errors.light = "Light condition is required";
    }
    
    if (!formData.watering_requirement.trim()) {
      errors.watering_requirement = "Watering requirement is required";
    }
    
    if (!formData.fertilization_requirement.trim()) {
      errors.fertilization_requirement = "Fertilization requirement is required";
    }
    
    if (!formData.soil_mix.trim()) {
      errors.soil_mix = "Soil mix is required";
    }
    
    if (!formData.toxicity.trim()) {
      errors.toxicity = "Toxicity is required";
    }
    
    if (!formData.lifespan.trim()) {
      errors.lifespan = "Lifespan is required";
    }
    
    if (!formData.horticulturist_notes.trim()) {
      errors.horticulturist_notes = "Horticulturist notes is required";
    }
    
    // Image validation:
    // - Create mode: image file is required
    // - Edit mode: either new image file OR existing image must be present
    if (modalMode === "create") {
      if (!formData.image) {
        errors.image = "Image is required";
      } else {
        const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!validTypes.includes(formData.image.type)) {
          errors.image = "Image must be JPG, PNG, or WebP";
        } else {
          const maxSize = 8 * 1024 * 1024;
          if (formData.image.size > maxSize) {
            errors.image = "Image must be smaller than 8MB";
          }
        }
      }
    } else {
      // Edit mode: check if there's an existing image OR a new image file
      const hasExistingImage = Boolean(existingImageUrl);
      if (!formData.image && !hasExistingImage) {
        errors.image = "Image is required";
      } else if (formData.image) {
        // Validate new image if provided
        const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!validTypes.includes(formData.image.type)) {
          errors.image = "Image must be JPG, PNG, or WebP";
        } else {
          const maxSize = 8 * 1024 * 1024;
          if (formData.image.size > maxSize) {
            errors.image = "Image must be smaller than 8MB";
          }
        }
      }
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Scroll to first validation error
  const scrollToFirstError = () => {
    // Define field order (priority order for scrolling)
    // Only includes scrollable fields (excludes can_be_procured)
    const fieldOrder: ScrollableField[] = [
      "name",
      "scientific_name",
      "category",
      "light",
      "watering_requirement",
      "fertilization_requirement",
      "soil_mix",
      "toxicity",
      "lifespan",
      "horticulturist_notes",
      "image",
    ];

    // Find first field with error (only scrollable fields)
    const firstErrorField = fieldOrder.find((field): field is ScrollableField => {
      return formErrors[field] !== undefined;
    });

    if (firstErrorField && scrollRefs[firstErrorField]?.current) {
      const fieldElement = scrollRefs[firstErrorField].current;
      const modalContainer = modalContentRef.current;
      
      if (fieldElement && modalContainer) {
        // Calculate position relative to modal container
        const fieldRect = fieldElement.getBoundingClientRect();
        const containerRect = modalContainer.getBoundingClientRect();
        const scrollTop = modalContainer.scrollTop;
        const targetTop = scrollTop + (fieldRect.top - containerRect.top) - 100; // 100px offset from top
        
        // Scroll within modal container
        modalContainer.scrollTo({
          top: targetTop,
          behavior: "smooth",
        });
        
        // Focus the input/select/textarea after a short delay to allow scroll to complete
        setTimeout(() => {
          if (fieldElement instanceof HTMLInputElement || 
              fieldElement instanceof HTMLSelectElement || 
              fieldElement instanceof HTMLTextAreaElement) {
            fieldElement.focus();
          }
        }, 300);
        return;
      }
    }

    // If no field error, scroll to error banner
    if (errorBannerRef.current && modalContentRef.current) {
      const bannerRect = errorBannerRef.current.getBoundingClientRect();
      const containerRect = modalContentRef.current.getBoundingClientRect();
      const scrollTop = modalContentRef.current.scrollTop;
      const targetTop = scrollTop + (bannerRect.top - containerRect.top) - 50; // 50px offset from top
      
      modalContentRef.current.scrollTo({
        top: targetTop,
        behavior: "smooth",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);
    
    // Validate form
    if (!validateForm()) {
      // Scroll to first error after validation fails
      // Use setTimeout to ensure DOM has updated with error messages
      setTimeout(() => {
        scrollToFirstError();
      }, 0);
      return;
    }
    
    setIsSubmitting(true);
    
    const formDataToSend = new FormData();
    formDataToSend.append("name", formData.name.trim());
    formDataToSend.append("scientific_name", formData.scientific_name.trim());
    formDataToSend.append("category", formData.category);
    formDataToSend.append("light", formData.light);
    formDataToSend.append("watering_requirement", formData.watering_requirement.trim());
    formDataToSend.append("fertilization_requirement", formData.fertilization_requirement.trim());
    formDataToSend.append("soil_mix", formData.soil_mix.trim());
    formDataToSend.append("toxicity", formData.toxicity.trim());
    formDataToSend.append("lifespan", formData.lifespan.trim());
    formDataToSend.append("horticulturist_notes", formData.horticulturist_notes.trim());
    formDataToSend.append("can_be_procured", formData.can_be_procured.toString());
    
    // Image is required in create mode, optional in edit mode
    if (formData.image) {
      formDataToSend.append("image", formData.image);
    }

    try {
      const url = modalMode === "edit" && editingPlantId 
        ? `/api/internal/plants/${editingPlantId}`
        : "/api/internal/plants";
      const method = modalMode === "edit" ? "PATCH" : "POST";
      
      const response = await fetch(url, {
        method,
        body: formDataToSend,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to create plant");
      }

      // Success: show message, refresh list, close modal
      setSubmitSuccess(true);
      await fetchPlants();
      
      // Close modal after brief delay to show success message
      setTimeout(() => {
        handleCloseModal();
      }, 1500);
    } catch (err) {
      console.error("Error creating plant:", err);
      setSubmitError(err instanceof Error ? err.message : "Failed to create plant");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const isFormValid = (): boolean => {
    // Check if image requirement is satisfied:
    // - Create mode: must have image file
    // - Edit mode: must have image file OR existing image
    const hasExistingImage = Boolean(existingImageUrl);
    const imageOk = modalMode === "create" 
      ? formData.image !== null 
      : (formData.image !== null || hasExistingImage);
    
    return (
      formData.name.trim() !== "" &&
      formData.scientific_name.trim() !== "" &&
      formData.category !== "" &&
      formData.light !== "" &&
      formData.watering_requirement.trim() !== "" &&
      formData.fertilization_requirement.trim() !== "" &&
      formData.soil_mix.trim() !== "" &&
      formData.toxicity.trim() !== "" &&
      formData.lifespan.trim() !== "" &&
      formData.horticulturist_notes.trim() !== "" &&
      imageOk &&
      Object.keys(formErrors).length === 0
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Plants</h1>
        <p className="text-sm text-gray-600 mt-1">Manage and view all plants</p>
      </div>

      {/* Add Plant Button */}
      <div className="flex justify-end">
        <button
          onClick={handleAddPlantClick}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Add Plant
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-3 lg:p-4 rounded-lg border border-gray-200 space-y-3 lg:space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 lg:gap-4">
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

          {/* Columns Selector */}
          <div className="flex items-end relative sm:flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsColumnsPopoverOpen(!isColumnsPopoverOpen)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Columns ({visibleColumnsCount})
            </button>
            {isColumnsPopoverOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setIsColumnsPopoverOpen(false)}
                />
                {/* Popover */}
                <div className="absolute right-0 top-full mt-2 z-20 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Visible Columns</h3>
                    <button
                      type="button"
                      onClick={handleResetColumns}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {PLANT_FIELD_DEFS.map((field) => (
                      <label
                        key={field.key}
                        className={`flex items-center space-x-2 ${
                          field.requiredInTable ? "opacity-60" : "cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns[field.key] ?? false}
                          disabled={field.requiredInTable}
                          onChange={() => handleToggleColumn(field.key)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span className="text-sm text-gray-700">
                          {field.label}
                          {field.requiredInTable && (
                            <span className="text-xs text-gray-400 ml-1">(Required)</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Published Filter - Segmented Control */}
        <div className="flex items-center">
          <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setPublishedFilter("all");
              }}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                publishedFilter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => {
                setPublishedFilter("non-published");
              }}
              className={`px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                publishedFilter === "non-published"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Non-published
            </button>
            <button
              type="button"
              onClick={() => {
                setPublishedFilter("published");
              }}
              className={`px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                publishedFilter === "published"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Published
            </button>
          </div>
        </div>

        {/* Count + Show All */}
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">
            Showing {displayPlants.length} of {totalCount} plants
          </div>
          {!showAll && displayPlants.length < totalCount && totalCount > 0 && (
            <button
              type="button"
              onClick={handleShowAll}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Show all
            </button>
          )}
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

      {/* Delete Message */}
      {deleteMessage && (
        <div
          className={`border rounded-lg p-4 ${
            deleteMessage.type === "success"
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <p
            className={`text-sm ${
              deleteMessage.type === "success"
                ? "text-green-800"
                : "text-red-800"
            }`}
          >
            {deleteMessage.text}
          </p>
        </div>
      )}

      {/* Plants Table - Desktop Only */}
      {!loading && !error && (
        <>
          {plants.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500">No plants found</p>
            </div>
          ) : (
            <>
              <div className="hidden lg:block bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {visibleColumns.thumbnail && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Thumbnail
                          </th>
                        )}
                        {visibleColumns.name && (
                          <th
                            onClick={() => isSortable("name") && visibleColumns.name && handleSort("name")}
                            className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                              isSortable("name") && visibleColumns.name ? "cursor-pointer hover:bg-gray-100 select-none" : ""
                            }`}
                          >
                            Name{getSortIndicator("name")}
                          </th>
                        )}
                        {visibleColumns.scientific_name && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            Scientific Name
                          </th>
                        )}
                        {visibleColumns.category && (
                          <th
                            onClick={() => isSortable("category") && visibleColumns.category && handleSort("category")}
                            className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                              isSortable("category") && visibleColumns.category ? "cursor-pointer hover:bg-gray-100 select-none" : ""
                            }`}
                          >
                            Category{getSortIndicator("category")}
                          </th>
                        )}
                        {visibleColumns.light && (
                          <th
                            onClick={() => isSortable("light") && visibleColumns.light && handleSort("light")}
                            className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                              isSortable("light") && visibleColumns.light ? "cursor-pointer hover:bg-gray-100 select-none" : ""
                            }`}
                          >
                            Light{getSortIndicator("light")}
                          </th>
                        )}
                        {visibleColumns.watering_requirement && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            Watering
                          </th>
                        )}
                        {visibleColumns.fertilization_requirement && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            Fertilization
                          </th>
                        )}
                        {visibleColumns.soil_mix && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            Soil Mix
                          </th>
                        )}
                        {visibleColumns.toxicity && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            Toxicity
                          </th>
                        )}
                        {visibleColumns.lifespan && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            Lifespan
                          </th>
                        )}
                        {visibleColumns.horticulturist_notes && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            Horticulturist Notes
                          </th>
                        )}
                        {visibleColumns.published && (
                          <th
                            onClick={() => isSortable("can_be_procured") && visibleColumns.published && handleSort("can_be_procured")}
                            className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                              isSortable("can_be_procured") && visibleColumns.published ? "cursor-pointer hover:bg-gray-100 select-none" : ""
                            }`}
                          >
                            Published{getSortIndicator("can_be_procured")}
                          </th>
                        )}
                        {visibleColumns.has_image && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            Has Image
                          </th>
                        )}
                        {visibleColumns.updated_at && (
                          <th
                            onClick={() => isSortable("updated_at") && visibleColumns.updated_at && handleSort("updated_at")}
                            className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                              isSortable("updated_at") && visibleColumns.updated_at ? "cursor-pointer hover:bg-gray-100 select-none" : ""
                            }`}
                          >
                            Updated{getSortIndicator("updated_at")}
                          </th>
                        )}
                        {visibleColumns.created_at && (
                          <th
                            onClick={() => isSortable("created_at") && visibleColumns.created_at && handleSort("created_at")}
                            className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                              isSortable("created_at") && visibleColumns.created_at ? "cursor-pointer hover:bg-gray-100 select-none" : ""
                            }`}
                          >
                            Created{getSortIndicator("created_at")}
                          </th>
                        )}
                        {visibleColumns.actions && (
                          <th className="sticky right-0 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap z-10">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {displayPlants.map((plant) => {
                        const thumbnailUrl = getThumbnailUrl(plant);
                        return (
                          <tr key={plant.id} className="hover:bg-gray-50 group">
                            {visibleColumns.thumbnail && (
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
                            )}
                            {visibleColumns.name && (
                              <td className="px-4 py-3">
                                <div className="text-sm font-medium text-gray-900">{plant.name}</div>
                              </td>
                            )}
                            {visibleColumns.scientific_name && (
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-gray-500 italic">{plant.scientific_name || "-"}</div>
                              </td>
                            )}
                            {visibleColumns.category && (
                              <td className="px-4 py-3 whitespace-nowrap">
                                {plant.category ? (
                                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                                    {plant.category}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-500">-</span>
                                )}
                              </td>
                            )}
                            {visibleColumns.light && (
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
                            )}
                            {visibleColumns.watering_requirement && (
                              <td className="px-4 py-3">
                                <div 
                                  className="text-sm text-gray-600 line-clamp-2" 
                                  title={plant.watering_requirement || undefined}
                                >
                                  {plant.watering_requirement || "-"}
                                </div>
                              </td>
                            )}
                            {visibleColumns.fertilization_requirement && (
                              <td className="px-4 py-3">
                                <div 
                                  className="text-sm text-gray-600 line-clamp-2" 
                                  title={plant.fertilization_requirement || undefined}
                                >
                                  {plant.fertilization_requirement || "-"}
                                </div>
                              </td>
                            )}
                            {visibleColumns.soil_mix && (
                              <td className="px-4 py-3">
                                <div 
                                  className="text-sm text-gray-600 line-clamp-2" 
                                  title={plant.soil_mix || undefined}
                                >
                                  {plant.soil_mix || "-"}
                                </div>
                              </td>
                            )}
                            {visibleColumns.toxicity && (
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-gray-500">{plant.toxicity || "-"}</div>
                              </td>
                            )}
                            {visibleColumns.lifespan && (
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-gray-500">{plant.lifespan || "-"}</div>
                              </td>
                            )}
                            {visibleColumns.horticulturist_notes && (
                              <td className="px-4 py-3">
                                <div className="text-sm text-gray-500" title={plant.horticulturist_notes || undefined}>
                                  {truncateText(plant.horticulturist_notes)}
                                </div>
                              </td>
                            )}
                            {visibleColumns.published && (
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
                            )}
                            {visibleColumns.has_image && (
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    plant.image_storage_url || plant.image_url || plant.thumbnail_storage_url || plant.thumbnail_url
                                      ? "bg-green-100 text-green-800"
                                      : "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {plant.image_storage_url || plant.image_url || plant.thumbnail_storage_url || plant.thumbnail_url ? "Yes" : "No"}
                                </span>
                              </td>
                            )}
                            {visibleColumns.updated_at && (
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-gray-500">
                                  {formatDate(plant.updated_at)}
                                </div>
                              </td>
                            )}
                            {visibleColumns.created_at && (
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-gray-500">
                                  {formatDate(plant.created_at)}
                                </div>
                              </td>
                            )}
                            {visibleColumns.actions && (
                              <td className="sticky right-0 bg-white group-hover:bg-gray-50 px-4 py-3 whitespace-nowrap z-10">
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => handleOpenModal(plant)}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                  >
                                    Edit
                                  </button>
                                  <span className="text-gray-300">|</span>
                                  <a
                                    href={`/internal/plants/${plant.id}`}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                  >
                                    View details
                                  </a>
                                  <span className="text-gray-300">|</span>
                                  <button
                                    onClick={() => handleDeletePlant(plant)}
                                    disabled={deletingPlantId === plant.id}
                                    className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {deletingPlantId === plant.id ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {displayPlants.map((plant) => {
                  const thumbnailUrl = getThumbnailUrl(plant);
                  return (
                    <div
                      key={plant.id}
                      className="bg-white rounded-lg border border-gray-200 p-4 space-y-3"
                    >
                      {/* Top row: thumbnail + name + scientific name + published badge */}
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
                              <span className="text-xs text-gray-400">No image</span>
                            </div>
                          )}
                        </div>
                        {/* Name and scientific name */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-gray-900">{plant.name}</div>
                          {plant.scientific_name && (
                            <div className="text-xs text-gray-500 italic mt-0.5">
                              {plant.scientific_name}
                            </div>
                          )}
                        </div>
                        {/* Published badge */}
                        <div className="flex-shrink-0">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              plant.can_be_procured
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {plant.can_be_procured ? "Published" : "Unpublished"}
                          </span>
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

                      {/* Third row: Watering */}
                      <div className="text-sm text-gray-600 line-clamp-1">
                        Watering: {plant.watering_requirement || "-"}
                      </div>

                      {/* Bottom row: Actions */}
                      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                        <button
                          onClick={() => handleOpenModal(plant)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <span className="text-gray-300">|</span>
                        <a
                          href={`/internal/plants/${plant.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          View details
                        </a>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => handleDeletePlant(plant)}
                          disabled={deletingPlantId === plant.id}
                          className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingPlantId === plant.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Add Plant Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={handleCloseModal}
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              ref={modalContentRef}
              className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  {modalMode === "edit" ? "Edit Plant" : "Add Plant"}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Success Message */}
                {submitSuccess && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <p className="text-sm text-green-800">
                      {modalMode === "edit" ? "Plant updated successfully!" : "Plant created successfully!"}
                    </p>
                  </div>
                )}

                {/* Error Message */}
                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-800">{submitError}</p>
                  </div>
                )}

                {/* Validation Summary Banner */}
                {Object.keys(formErrors).length > 0 && (
                  <div ref={errorBannerRef} className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <p className="text-sm text-yellow-800">Please fill all required fields.</p>
                  </div>
                )}

                {/* Name */}
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={nameRef}
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => {
                      handleInputChange(e);
                      if (formErrors.name) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.name;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.name
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                  {formErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                  )}
                </div>

                {/* Scientific Name */}
                <div>
                  <label
                    htmlFor="scientific_name"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Scientific Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={scientific_nameRef}
                    id="scientific_name"
                    name="scientific_name"
                    type="text"
                    required
                    value={formData.scientific_name}
                    onChange={(e) => {
                      handleInputChange(e);
                      if (formErrors.scientific_name) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.scientific_name;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.scientific_name
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                  {formErrors.scientific_name && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.scientific_name}</p>
                  )}
                </div>

                {/* Category Dropdown */}
                <div>
                  <label
                    htmlFor="category"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    ref={categoryRef}
                    id="category"
                    name="category"
                    required
                    value={formData.category}
                    onChange={(e) => {
                      handleInputChange(e);
                      if (formErrors.category) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.category;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.category
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  >
                    <option value="" disabled>Select a category</option>
                    {PLANT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  {formErrors.category && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.category}</p>
                  )}
                </div>

                {/* Light Dropdown */}
                <div>
                  <label
                    htmlFor="light"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Light <span className="text-red-500">*</span>
                  </label>
                  <select
                    ref={lightRef}
                    id="light"
                    name="light"
                    required
                    value={formData.light}
                    onChange={(e) => {
                      handleInputChange(e);
                      if (formErrors.light) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.light;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.light
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  >
                    <option value="" disabled>Select light condition</option>
                    {LIGHT_CONDITIONS.map((light) => (
                      <option key={light} value={light}>
                        {light}
                      </option>
                    ))}
                  </select>
                  {formErrors.light && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.light}</p>
                  )}
                </div>

                {/* Watering Requirement */}
                <div>
                  <label
                    htmlFor="watering_requirement"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Watering Requirement <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    ref={watering_requirementRef}
                    id="watering_requirement"
                    name="watering_requirement"
                    rows={3}
                    required
                    value={formData.watering_requirement}
                    onChange={(e) => {
                      handleInputChange(e);
                      if (formErrors.watering_requirement) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.watering_requirement;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.watering_requirement
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                  {formErrors.watering_requirement && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.watering_requirement}</p>
                  )}
                </div>

                {/* Fertilization Requirement */}
                <div>
                  <label
                    htmlFor="fertilization_requirement"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Fertilization Requirement <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    ref={fertilization_requirementRef}
                    id="fertilization_requirement"
                    name="fertilization_requirement"
                    rows={3}
                    required
                    value={formData.fertilization_requirement}
                    onChange={(e) => {
                      handleInputChange(e);
                      if (formErrors.fertilization_requirement) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.fertilization_requirement;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.fertilization_requirement
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                  {formErrors.fertilization_requirement && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.fertilization_requirement}</p>
                  )}
                </div>

                {/* Soil Mix */}
                <div>
                  <label
                    htmlFor="soil_mix"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Soil Mix <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    ref={soil_mixRef}
                    id="soil_mix"
                    name="soil_mix"
                    rows={3}
                    required
                    value={formData.soil_mix}
                    onChange={(e) => {
                      handleInputChange(e);
                      if (formErrors.soil_mix) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.soil_mix;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.soil_mix
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                  {formErrors.soil_mix && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.soil_mix}</p>
                  )}
                </div>

                {/* Toxicity */}
                <div>
                  <label
                    htmlFor="toxicity"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Toxicity <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={toxicityRef}
                    id="toxicity"
                    name="toxicity"
                    type="text"
                    required
                    value={formData.toxicity}
                    onChange={(e) => {
                      handleInputChange(e);
                      if (formErrors.toxicity) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.toxicity;
                          return next;
                        });
                      }
                    }}
                    placeholder="e.g., Pet Safe, Mildly Toxic, Toxic"
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.toxicity
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                  {formErrors.toxicity && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.toxicity}</p>
                  )}
                </div>

                {/* Lifespan */}
                <div>
                  <label
                    htmlFor="lifespan"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Lifespan <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={lifespanRef}
                    id="lifespan"
                    name="lifespan"
                    type="text"
                    required
                    value={formData.lifespan}
                    onChange={(e) => {
                      handleInputChange(e);
                      if (formErrors.lifespan) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.lifespan;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.lifespan
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                  {formErrors.lifespan && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.lifespan}</p>
                  )}
                </div>

                {/* Horticulturist Notes */}
                <div>
                  <label
                    htmlFor="horticulturist_notes"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Horticulturist Notes <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    ref={horticulturist_notesRef}
                    id="horticulturist_notes"
                    name="horticulturist_notes"
                    rows={4}
                    required
                    value={formData.horticulturist_notes}
                    onChange={(e) => {
                      handleInputChange(e);
                      if (formErrors.horticulturist_notes) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.horticulturist_notes;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.horticulturist_notes
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                  {formErrors.horticulturist_notes && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.horticulturist_notes}</p>
                  )}
                </div>

                {/* Image Upload */}
                <div>
                  <label
                    htmlFor="image"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Plant Image {modalMode === "create" && <span className="text-red-500">*</span>}
                    {modalMode === "edit" && <span className="text-gray-500 text-xs ml-2">(Optional - leave empty to keep current image)</span>}
                  </label>
                  {modalMode === "edit" && existingImageUrl && (
                    <div className="mb-3">
                      <p className="text-sm text-gray-600 mb-2">Current image:</p>
                      <img
                        src={existingImageUrl}
                        alt="Current plant image"
                        className="max-w-xs h-auto rounded-lg border border-gray-200"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                  <input
                    ref={imageRef}
                    id="image"
                    name="image"
                    type="file"
                    required={modalMode === "create"}
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFileChange}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      formErrors.image
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                  {formData.image && !formErrors.image && (
                    <p className="mt-1 text-sm text-gray-500">
                      Selected: {formData.image.name} ({(formData.image.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                  {formErrors.image && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.image}</p>
                  )}
                </div>

                {/* Can Be Procured (Published) */}
                <div>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="can_be_procured"
                      checked={formData.can_be_procured}
                      onChange={handleInputChange}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Can be procured (Published) <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    This field must be explicitly checked or unchecked
                  </p>
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !isFormValid()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting 
                      ? (modalMode === "edit" ? "Saving..." : "Creating...") 
                      : (modalMode === "edit" ? "Save Changes" : "Add Plant")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
