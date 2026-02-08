"use client";

import { useState, useEffect } from "react";
import type { HomepageContent } from "@/lib/schemas/homepage.schema";
import InternalImageInput from "./InternalImageInput";

interface HomepageEditorProps {
  initialContent: HomepageContent;
}

// Extended pricing tier type for editor (with pricingOptions)
interface PricingOption {
  frequency: string;
  price: number;
  isPopular?: boolean;
}

interface EditorPricingTier {
  label: string;
  pricingOptions: PricingOption[];
}

interface EditorPricing {
  title: string;
  description: string;
  tiers: EditorPricingTier[];
}

// Transform schema pricing to editor format
function transformPricingToEditor(pricing: HomepageContent["pricing"]): EditorPricing {
  return {
    title: pricing.title,
    description: pricing.description,
    tiers: pricing.tiers.map((tier, idx) => {
      const options: PricingOption[] = [];
      
      // Add primary option
      options.push({
        frequency: tier.frequencyPrimary,
        price: tier.pricePrimary,
        isPopular: false,
      });
      
      // Add secondary option if exists
      if (tier.priceSecondary !== null && tier.frequencySecondary !== null) {
        options.push({
          frequency: tier.frequencySecondary,
          price: tier.priceSecondary,
          isPopular: idx === 2, // Tier 3 (40+ pots) - mark second option as popular by default
        });
      }
      
      // For Tier 3, if only one option exists, add default weekly option
      // Default: primary option (not popular) + "Weekly" (popular)
      if (idx === 2 && options.length === 1) {
        options.push({
          frequency: "Weekly",
          price: tier.pricePrimary, // Use same price as primary for default
          isPopular: true,
        });
      }
      
      return {
        label: tier.label,
        pricingOptions: options,
      };
    }),
  };
}

// Transform editor pricing back to schema format
// Note: Schema only supports 2 options max, so we take first 2
function transformPricingToSchema(editorPricing: EditorPricing): HomepageContent["pricing"] {
  return {
    title: editorPricing.title,
    description: editorPricing.description,
    tiers: editorPricing.tiers.map((tier) => {
      const firstOption = tier.pricingOptions[0];
      const secondOption = tier.pricingOptions[1] || null;
      
      // Ensure we have at least one option
      if (!firstOption) {
        throw new Error(`Tier "${tier.label}" must have at least one pricing option`);
      }
      
      return {
        label: tier.label,
        pricePrimary: firstOption.price,
        frequencyPrimary: firstOption.frequency,
        priceSecondary: secondOption?.price ?? null,
        frequencySecondary: secondOption?.frequency ?? null,
      };
    }),
  };
}

// Normalize steps: sort by stepNumber once on load, then ignore stepNumber
function normalizeSteps(steps: HomepageContent["nuvvyCareVisit"]["steps"]) {
  // Sort by stepNumber to fix any ordering issues
  const sorted = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
  // Recompute stepNumber based on array index
  return sorted.map((step, idx) => ({
    ...step,
    stepNumber: idx + 1,
  }));
}

export default function HomepageEditor({ initialContent }: HomepageEditorProps) {
  // Transform pricing to editor format
  const [editorPricing, setEditorPricing] = useState<EditorPricing>(
    transformPricingToEditor(initialContent.pricing)
  );
  
  // Normalize steps on initial load
  const normalizedSteps = normalizeSteps(initialContent.nuvvyCareVisit.steps);
  
  // Keep rest of content as-is, sync pricing when editorPricing changes
  const [content, setContent] = useState<HomepageContent>({
    ...initialContent,
    pricing: transformPricingToSchema(transformPricingToEditor(initialContent.pricing)),
    nuvvyCareVisit: {
      ...initialContent.nuvvyCareVisit,
      steps: normalizedSteps,
    },
  });
  
  // Sync editorPricing changes to content
  useEffect(() => {
    setContent((prev) => ({
      ...prev,
      pricing: transformPricingToSchema(editorPricing),
    }));
  }, [editorPricing]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Collapsible section states - all closed by default
  const [openSections, setOpenSections] = useState({
    hero: false,
    horticulturistCare: false,
    compareCare: false,
    careVisit: false,
    seeTheDifference: false,
    pricing: false,
    expertPlantHero: false,
    mostPopularPlants: false,
    socialProof: false,
  });

  // Image upload states (keyed by section and index)
  const [uploadingImages, setUploadingImages] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string | null>>({});
  const [portraitWarnings, setPortraitWarnings] = useState<Record<string, boolean>>({});

  // Plant selector states
  const [allPlants, setAllPlants] = useState<Array<{ id: string; name: string; thumbnailUrl?: string }>>([]);
  const [plantSearchQuery, setPlantSearchQuery] = useState("");
  const [loadingPlants, setLoadingPlants] = useState(false);
  const [replacingPlantId, setReplacingPlantId] = useState<string | null>(null);
  
  const MAX_PLANTS = 6;

  // Fetch plants for selector
  useEffect(() => {
    const fetchPlants = async () => {
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

    fetchPlants();
  }, []);

  // Filter plants by search query
  const filteredPlants = allPlants.filter((plant) =>
    plant.name.toLowerCase().includes(plantSearchQuery.toLowerCase())
  );

  // Get selected plants with full data for display
  const selectedPlants = content.mostPopularPlants.plantIds
    .map((id) => {
      const plant = allPlants.find((p) => p.id === id);
      return plant ? { id, name: plant.name, thumbnailUrl: plant.thumbnailUrl } : null;
    })
    .filter((p): p is { id: string; name: string; thumbnailUrl: string | undefined } => p !== null);

  // Filter out already-selected plants from search results
  const availableSearchResults = filteredPlants.filter(
    (plant) => !content.mostPopularPlants.plantIds.includes(plant.id)
  );

  const handleAddOrReplacePlant = (plantId: string, replaceId?: string) => {
    if (replaceId) {
      // Replace existing plant
      const newPlantIds = content.mostPopularPlants.plantIds.map((id) =>
        id === replaceId ? plantId : id
      );
      setContent({
        ...content,
        mostPopularPlants: {
          ...content.mostPopularPlants,
          plantIds: newPlantIds,
        },
      });
      setReplacingPlantId(null);
    } else if (content.mostPopularPlants.plantIds.length < MAX_PLANTS) {
      // Add new plant if under limit
      if (!content.mostPopularPlants.plantIds.includes(plantId)) {
        setContent({
          ...content,
          mostPopularPlants: {
            ...content.mostPopularPlants,
            plantIds: [...content.mostPopularPlants.plantIds, plantId],
          },
        });
      }
    } else {
      // At max capacity - enable replace mode
      setReplacingPlantId(plantId);
    }
    setPlantSearchQuery(""); // Clear search after adding/replacing
  };

  const handleRemovePlant = (plantId: string) => {
    setContent({
      ...content,
      mostPopularPlants: {
        ...content.mostPopularPlants,
        plantIds: content.mostPopularPlants.plantIds.filter((id) => id !== plantId),
      },
    });
    // Clear replace mode if the removed plant was being replaced
    if (replacingPlantId) {
      setReplacingPlantId(null);
    }
  };

  const handleCancelReplace = () => {
    setReplacingPlantId(null);
    setPlantSearchQuery("");
  };

  // Hero management helpers
  const MAX_HEROES = 3;

  const getSortedHeroes = (heroes: typeof content.heroSection.heroes) => {
    return [...heroes].sort((a, b) => a.order - b.order);
  };

  const handleAddHero = (section: "hero" | "expertPlantHero") => {
    const currentHeroes = section === "hero" 
      ? content.heroSection.heroes 
      : content.expertLedPlantSelection.heroes;
    
    if (currentHeroes.length >= MAX_HEROES) return;

    const maxOrder = currentHeroes.length > 0 
      ? Math.max(...currentHeroes.map(h => h.order))
      : -1;
    
    const newHero = {
      id: crypto.randomUUID(),
      heading: "",
      subheading: "",
      imageUrl: "",
      order: maxOrder + 1,
    };

    if (section === "hero") {
      setContent({
        ...content,
        heroSection: { heroes: [...currentHeroes, newHero] },
      });
    } else {
      setContent({
        ...content,
        expertLedPlantSelection: { heroes: [...currentHeroes, newHero] },
      });
    }
  };

  const handleRemoveHero = (section: "hero" | "expertPlantHero", heroId: string) => {
    const currentHeroes = section === "hero"
      ? content.heroSection.heroes
      : content.expertLedPlantSelection.heroes;
    
    const filtered = currentHeroes.filter(h => h.id !== heroId);
    
    // Reindex orders
    const reindexed = filtered
      .sort((a, b) => a.order - b.order)
      .map((hero, idx) => ({ ...hero, order: idx }));

    if (section === "hero") {
      setContent({
        ...content,
        heroSection: { heroes: reindexed },
      });
    } else {
      setContent({
        ...content,
        expertLedPlantSelection: { heroes: reindexed },
      });
    }
  };

  const handleMoveHero = (
    section: "hero" | "expertPlantHero",
    heroId: string,
    direction: "up" | "down"
  ) => {
    const currentHeroes = section === "hero"
      ? content.heroSection.heroes
      : content.expertLedPlantSelection.heroes;
    
    const sorted = getSortedHeroes(currentHeroes);
    const currentIndex = sorted.findIndex(h => h.id === heroId);
    
    if (currentIndex === -1) return;
    
    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sorted.length) return;

    // Swap orders
    const updated = [...sorted];
    const tempOrder = updated[currentIndex].order;
    updated[currentIndex] = { ...updated[currentIndex], order: updated[newIndex].order };
    updated[newIndex] = { ...updated[newIndex], order: tempOrder };

    if (section === "hero") {
      setContent({
        ...content,
        heroSection: { heroes: updated },
      });
    } else {
      setContent({
        ...content,
        expertLedPlantSelection: { heroes: updated },
      });
    }
  };

  const handleImageUpload = async (
    section: "hero" | "expertPlantHero",
    heroIndex: number,
    file: File
  ) => {
    const uploadKey = `${section}-${heroIndex}`;
    setUploadingImages((prev) => ({ ...prev, [uploadKey]: true }));
    setUploadErrors((prev) => ({ ...prev, [uploadKey]: null }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/internal/homepage/upload-image", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to upload image");
      }

      // Update the hero image URL
      if (section === "hero") {
        const newHeroes = [...content.heroSection.heroes];
        newHeroes[heroIndex] = { ...newHeroes[heroIndex], imageUrl: result.data.url };
        setContent({ ...content, heroSection: { heroes: newHeroes } });
      } else if (section === "expertPlantHero") {
        const newHeroes = [...content.expertLedPlantSelection.heroes];
        newHeroes[heroIndex] = { ...newHeroes[heroIndex], imageUrl: result.data.url };
        setContent({ ...content, expertLedPlantSelection: { heroes: newHeroes } });
      }
    } catch (err) {
      setUploadErrors((prev) => ({
        ...prev,
        [uploadKey]: err instanceof Error ? err.message : "Failed to upload image",
      }));
    } finally {
      setUploadingImages((prev) => ({ ...prev, [uploadKey]: false }));
    }
  };

  // Move step up or down
  const handleMoveStep = (idx: number, direction: "up" | "down") => {
    const steps = [...content.nuvvyCareVisit.steps];
    const newIndex = direction === "up" ? idx - 1 : idx + 1;
    
    if (newIndex < 0 || newIndex >= steps.length) return;
    
    // Swap steps
    [steps[idx], steps[newIndex]] = [steps[newIndex], steps[idx]];
    
    // Recompute stepNumber based on new positions
    const reindexed = steps.map((step, i) => ({
      ...step,
      stepNumber: i + 1,
    }));
    
    setContent({
      ...content,
      nuvvyCareVisit: {
        ...content.nuvvyCareVisit,
        steps: reindexed,
      },
    });
  };

  // Helper to normalize subheading: use "." if empty/whitespace/placeholder
  const normalizeSubheading = (subheading: string): string => {
    const trimmed = subheading.trim();
    if (trimmed === "" || trimmed === "_") {
      return ".";
    }
    return subheading;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Normalize steps: recompute stepNumber based on array index
      const normalizedSteps = content.nuvvyCareVisit.steps.map((step, idx) => ({
        ...step,
        stepNumber: idx + 1,
      }));
      
      // Normalize hero subheadings: auto-fill empty ones with "."
      const normalizedHeroSection = {
        heroes: content.heroSection.heroes.map((hero) => ({
          ...hero,
          subheading: normalizeSubheading(hero.subheading),
        })),
      };
      
      const normalizedExpertPlantHero = {
        heroes: content.expertLedPlantSelection.heroes.map((hero) => ({
          ...hero,
          subheading: normalizeSubheading(hero.subheading),
        })),
      };
      
      // Transform editor pricing back to schema format
      const contentToSave: HomepageContent = {
        ...content,
        heroSection: normalizedHeroSection,
        expertLedPlantSelection: normalizedExpertPlantHero,
        pricing: transformPricingToSchema(editorPricing),
        nuvvyCareVisit: {
          ...content.nuvvyCareVisit,
          steps: normalizedSteps,
        },
      };
      
      const response = await fetch("/api/internal/homepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToSave }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to save homepage content");
      }

      setSuccess(true);
      setSaving(false);
      
      // Open preview in new tab after successful save
      window.open("/preview/homepage", "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Save Button & Preview Link */}
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
            {saving ? "Saving..." : "Save & Preview"}
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setOpenSections({ ...openSections, hero: !openSections.hero })}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900">Hero Section</h2>
          <span className="text-gray-500">{openSections.hero ? "▼" : "▶"}</span>
        </button>
        {openSections.hero && (
          <div className="px-6 pb-6">
            <div className="space-y-4">
              {getSortedHeroes(content.heroSection.heroes).map((hero, idx) => {
                const originalIdx = content.heroSection.heroes.findIndex(h => h.id === hero.id);
                return (
            <div key={hero.id} className="relative border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-700">Hero {idx + 1}</h3>
                <div className="flex items-center gap-2">
                  {/* Reorder buttons */}
                  <button
                    type="button"
                    onClick={() => handleMoveHero("hero", hero.id, "up")}
                    disabled={idx === 0}
                    className="px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveHero("hero", hero.id, "down")}
                    disabled={idx === getSortedHeroes(content.heroSection.heroes).length - 1}
                    className="px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveHero("hero", hero.id)}
                    className="px-2 py-1 text-gray-500 hover:text-red-600 text-sm"
                    aria-label="Remove hero"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
                  <input
                    type="text"
                    value={hero.heading}
                    onChange={(e) => {
                      const newHeroes = [...content.heroSection.heroes];
                      newHeroes[originalIdx] = { ...hero, heading: e.target.value };
                      setContent({ ...content, heroSection: { heroes: newHeroes } });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subheading</label>
                  <textarea
                    value={hero.subheading}
                    onChange={(e) => {
                      const newHeroes = [...content.heroSection.heroes];
                      newHeroes[originalIdx] = { ...hero, subheading: e.target.value };
                      setContent({ ...content, heroSection: { heroes: newHeroes } });
                    }}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <label className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleImageUpload("hero", originalIdx, file);
                            }
                          }}
                          disabled={uploadingImages[`hero-${originalIdx}`]}
                          className="hidden"
                        />
                        <span className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                          {uploadingImages[`hero-${originalIdx}`] ? "Uploading..." : "Upload Image"}
                        </span>
                      </label>
                    </div>
                    <input
                      type="text"
                      value={hero.imageUrl}
                      onChange={(e) => {
                        const newHeroes = [...content.heroSection.heroes];
                        newHeroes[originalIdx] = { ...hero, imageUrl: e.target.value };
                        setContent({ ...content, heroSection: { heroes: newHeroes } });
                        // Clear portrait warning when URL changes
                        setPortraitWarnings((prev) => ({
                          ...prev,
                          [`hero-${originalIdx}`]: false,
                        }));
                      }}
                      placeholder="Or enter image URL directly"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    {uploadErrors[`hero-${originalIdx}`] && (
                      <p className="text-sm text-red-600">{uploadErrors[`hero-${originalIdx}`]}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Recommended: landscape images (≥1600×900). Images are cropped automatically to fit.
                    </p>
                    {portraitWarnings[`hero-${originalIdx}`] && (
                      <p className="text-sm text-amber-600 mt-1">
                        ⚠️ This image is portrait. Hero banners work best with landscape images. Portrait images will be cropped.
                      </p>
                    )}
                    {hero.imageUrl && (
                      <div className="mt-2">
                        <img
                          src={hero.imageUrl}
                          alt={`Hero ${idx + 1} preview`}
                          className="max-w-full h-auto max-h-48 rounded-lg border border-gray-200"
                          onLoad={(e) => {
                            const img = e.target as HTMLImageElement;
                            const isPortrait = img.naturalHeight > img.naturalWidth;
                            setPortraitWarnings((prev) => ({
                              ...prev,
                              [`hero-${originalIdx}`]: isPortrait,
                            }));
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            setPortraitWarnings((prev) => ({
                              ...prev,
                              [`hero-${originalIdx}`]: false,
                            }));
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
          })}
              
              {/* Add Hero Button */}
              {content.heroSection.heroes.length < MAX_HEROES && (
                <button
                  type="button"
                  onClick={() => handleAddHero("hero")}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  + Add Hero
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Horticulturist-led Care */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setOpenSections({ ...openSections, horticulturistCare: !openSections.horticulturistCare })}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900">Horticulturist-led Care</h2>
          <span className="text-gray-500">{openSections.horticulturistCare ? "▼" : "▶"}</span>
        </button>
        {openSections.horticulturistCare && (
          <div className="px-6 pb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={content.horticulturistCare.title}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      horticulturistCare: { ...content.horticulturistCare, title: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="space-y-4">
                {content.horticulturistCare.bullets.map((bullet, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-700 mb-3">Bullet {idx + 1}</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bold Text</label>
                        <input
                          type="text"
                          value={bullet.boldText}
                          onChange={(e) => {
                            const newBullets = [...content.horticulturistCare.bullets];
                            newBullets[idx] = { ...bullet, boldText: e.target.value };
                            setContent({
                              ...content,
                              horticulturistCare: { ...content.horticulturistCare, bullets: newBullets },
                            });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Rest Text</label>
                        <input
                          type="text"
                          value={bullet.restText}
                          onChange={(e) => {
                            const newBullets = [...content.horticulturistCare.bullets];
                            newBullets[idx] = { ...bullet, restText: e.target.value };
                            setContent({
                              ...content,
                              horticulturistCare: { ...content.horticulturistCare, bullets: newBullets },
                            });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Compare Nuvvy Care */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setOpenSections({ ...openSections, compareCare: !openSections.compareCare })}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900">Compare Nuvvy Care</h2>
          <span className="text-gray-500">{openSections.compareCare ? "▼" : "▶"}</span>
        </button>
        {openSections.compareCare && (
          <div className="px-6 pb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={content.compareNuvvyCare.title}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      compareNuvvyCare: { ...content.compareNuvvyCare, title: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="space-y-4">
                {content.compareNuvvyCare.rows.map((row, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-700 mb-3">Row {idx + 1}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => {
                        const newRows = [...content.compareNuvvyCare.rows];
                        newRows[idx] = { ...row, label: e.target.value };
                        setContent({
                          ...content,
                          compareNuvvyCare: { ...content.compareNuvvyCare, rows: newRows },
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Regular Gardener - Type</label>
                      <select
                        value={row.regular.type}
                        onChange={(e) => {
                          const newRows = [...content.compareNuvvyCare.rows];
                          newRows[idx] = {
                            ...row,
                            regular: { ...row.regular, type: e.target.value as "check" | "warning" | "cross" },
                          };
                          setContent({
                            ...content,
                            compareNuvvyCare: { ...content.compareNuvvyCare, rows: newRows },
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="check">Check</option>
                        <option value="warning">Warning</option>
                        <option value="cross">Cross</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Regular Gardener - Text</label>
                      <input
                        type="text"
                        value={row.regular.text}
                        onChange={(e) => {
                          const newRows = [...content.compareNuvvyCare.rows];
                          newRows[idx] = { ...row, regular: { ...row.regular, text: e.target.value } };
                          setContent({
                            ...content,
                            compareNuvvyCare: { ...content.compareNuvvyCare, rows: newRows },
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nuvvy Care - Type</label>
                      <select
                        value={row.nuvvy.type}
                        onChange={(e) => {
                          const newRows = [...content.compareNuvvyCare.rows];
                          newRows[idx] = {
                            ...row,
                            nuvvy: { ...row.nuvvy, type: e.target.value as "check" | "warning" | "cross" },
                          };
                          setContent({
                            ...content,
                            compareNuvvyCare: { ...content.compareNuvvyCare, rows: newRows },
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="check">Check</option>
                        <option value="warning">Warning</option>
                        <option value="cross">Cross</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nuvvy Care - Text</label>
                      <input
                        type="text"
                        value={row.nuvvy.text}
                        onChange={(e) => {
                          const newRows = [...content.compareNuvvyCare.rows];
                          newRows[idx] = { ...row, nuvvy: { ...row.nuvvy, text: e.target.value } };
                          setContent({
                            ...content,
                            compareNuvvyCare: { ...content.compareNuvvyCare, rows: newRows },
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Nuvvy Care Visit */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setOpenSections({ ...openSections, careVisit: !openSections.careVisit })}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900">Nuvvy Care Visit</h2>
          <span className="text-gray-500">{openSections.careVisit ? "▼" : "▶"}</span>
        </button>
        {openSections.careVisit && (
          <div className="px-6 pb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={content.nuvvyCareVisit.title}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      nuvvyCareVisit: { ...content.nuvvyCareVisit, title: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="space-y-4">
                {content.nuvvyCareVisit.steps.map((step, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-700">Step {idx + 1}</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleMoveStep(idx, "up")}
                      disabled={idx === 0}
                      className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed rounded border border-gray-300 transition-colors"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveStep(idx, "down")}
                      disabled={idx === content.nuvvyCareVisit.steps.length - 1}
                      className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed rounded border border-gray-300 transition-colors"
                      title="Move down"
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={step.title}
                      onChange={(e) => {
                        const newSteps = [...content.nuvvyCareVisit.steps];
                        newSteps[idx] = { ...step, title: e.target.value };
                        setContent({
                          ...content,
                          nuvvyCareVisit: { ...content.nuvvyCareVisit, steps: newSteps },
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={step.description}
                      onChange={(e) => {
                        const newSteps = [...content.nuvvyCareVisit.steps];
                        newSteps[idx] = { ...step, description: e.target.value };
                        setContent({
                          ...content,
                          nuvvyCareVisit: { ...content.nuvvyCareVisit, steps: newSteps },
                        });
                      }}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <InternalImageInput
                      value={step.imageUrl}
                      onChange={(url) => {
                        const newSteps = [...content.nuvvyCareVisit.steps];
                        newSteps[idx] = { ...step, imageUrl: url };
                        setContent({
                          ...content,
                          nuvvyCareVisit: { ...content.nuvvyCareVisit, steps: newSteps },
                        });
                      }}
                      label="Image URL"
                    />
                  </div>
                </div>
              </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* See the Difference */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setOpenSections({ ...openSections, seeTheDifference: !openSections.seeTheDifference })}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900">See the Difference</h2>
          <span className="text-gray-500">{openSections.seeTheDifference ? "▼" : "▶"}</span>
        </button>
        {openSections.seeTheDifference && (
          <div className="px-6 pb-6">
            <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={content.seeTheDifference.title}
              onChange={(e) =>
                setContent({
                  ...content,
                  seeTheDifference: { ...content.seeTheDifference, title: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="space-y-4">
            {content.seeTheDifference.images.map((image, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-700 mb-3">Image {idx + 1}</h3>
                <div className="space-y-3">
                  <div>
                    <InternalImageInput
                      value={image.imageUrl}
                      onChange={(url) => {
                        const newImages = [...content.seeTheDifference.images];
                        newImages[idx] = { ...image, imageUrl: url };
                        setContent({
                          ...content,
                          seeTheDifference: { ...content.seeTheDifference, images: newImages },
                        });
                      }}
                      label="Image URL"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Caption (optional)</label>
                    <input
                      type="text"
                      value={image.caption || ""}
                      onChange={(e) => {
                        const newImages = [...content.seeTheDifference.images];
                        newImages[idx] = { ...image, caption: e.target.value || undefined };
                        setContent({
                          ...content,
                          seeTheDifference: { ...content.seeTheDifference, images: newImages },
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Optional caption"
                    />
                  </div>
                </div>
              </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Pricing */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setOpenSections({ ...openSections, pricing: !openSections.pricing })}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900">Pricing</h2>
          <span className="text-gray-500">{openSections.pricing ? "▼" : "▶"}</span>
        </button>
        {openSections.pricing && (
          <div className="px-6 pb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={editorPricing.title}
                  onChange={(e) =>
                    setEditorPricing({ ...editorPricing, title: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editorPricing.description}
                  onChange={(e) =>
                    setEditorPricing({ ...editorPricing, description: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="space-y-4">
                {editorPricing.tiers.map((tier, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-700 mb-3">Tier {idx + 1}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                    <input
                      type="text"
                      value={tier.label}
                      onChange={(e) => {
                        const newTiers = [...editorPricing.tiers];
                        newTiers[idx] = { ...tier, label: e.target.value };
                        setEditorPricing({ ...editorPricing, tiers: newTiers });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  
                  {/* Pricing Options */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-700">Pricing Options</label>
                      {idx === 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newTiers = [...editorPricing.tiers];
                            newTiers[idx] = {
                              ...tier,
                              pricingOptions: [
                                ...tier.pricingOptions,
                                { frequency: "", price: 0, isPopular: false },
                              ],
                            };
                            setEditorPricing({ ...editorPricing, tiers: newTiers });
                          }}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          + Add Option
                        </button>
                      )}
                    </div>
                    
                    {tier.pricingOptions.map((option, optionIdx) => (
                      <div key={optionIdx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 space-y-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                              <input
                                type="text"
                                value={option.frequency}
                                onChange={(e) => {
                                  const newTiers = [...editorPricing.tiers];
                                  const newOptions = [...tier.pricingOptions];
                                  newOptions[optionIdx] = { ...option, frequency: e.target.value };
                                  newTiers[idx] = { ...tier, pricingOptions: newOptions };
                                  setEditorPricing({ ...editorPricing, tiers: newTiers });
                                }}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                placeholder="e.g., Once every two weeks"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Price (₹)</label>
                              <input
                                type="number"
                                value={option.price}
                                onChange={(e) => {
                                  const newTiers = [...editorPricing.tiers];
                                  const newOptions = [...tier.pricingOptions];
                                  newOptions[optionIdx] = { ...option, price: Number(e.target.value) };
                                  newTiers[idx] = { ...tier, pricingOptions: newOptions };
                                  setEditorPricing({ ...editorPricing, tiers: newTiers });
                                }}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 pt-6">
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={option.isPopular || false}
                                onChange={(e) => {
                                  const newTiers = [...editorPricing.tiers];
                                  const newOptions = [...tier.pricingOptions];
                                  // Uncheck other options in this tier
                                  newOptions.forEach((opt, i) => {
                                    if (i === optionIdx) {
                                      opt.isPopular = e.target.checked;
                                    } else {
                                      opt.isPopular = false;
                                    }
                                  });
                                  newTiers[idx] = { ...tier, pricingOptions: newOptions };
                                  setEditorPricing({ ...editorPricing, tiers: newTiers });
                                }}
                                className="rounded"
                              />
                              <span className="text-gray-600">Popular</span>
                            </label>
                            {tier.pricingOptions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newTiers = [...editorPricing.tiers];
                                  newTiers[idx] = {
                                    ...tier,
                                    pricingOptions: tier.pricingOptions.filter((_, i) => i !== optionIdx),
                                  };
                                  setEditorPricing({ ...editorPricing, tiers: newTiers });
                                }}
                                className="text-xs text-red-600 hover:text-red-700"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Expert-led Plant Selection Hero */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setOpenSections({ ...openSections, expertPlantHero: !openSections.expertPlantHero })}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900">Expert-led Plant Selection Hero</h2>
          <span className="text-gray-500">{openSections.expertPlantHero ? "▼" : "▶"}</span>
        </button>
        {openSections.expertPlantHero && (
          <div className="px-6 pb-6">
            <div className="space-y-4">
              {getSortedHeroes(content.expertLedPlantSelection.heroes).map((hero, idx) => {
                const originalIdx = content.expertLedPlantSelection.heroes.findIndex(h => h.id === hero.id);
                return (
                <div key={hero.id} className="relative border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-700">Hero {idx + 1}</h3>
                    <div className="flex items-center gap-2">
                      {/* Reorder buttons */}
                      <button
                        type="button"
                        onClick={() => handleMoveHero("expertPlantHero", hero.id, "up")}
                        disabled={idx === 0}
                        className="px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveHero("expertPlantHero", hero.id, "down")}
                        disabled={idx === getSortedHeroes(content.expertLedPlantSelection.heroes).length - 1}
                        className="px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveHero("expertPlantHero", hero.id)}
                        className="px-2 py-1 text-gray-500 hover:text-red-600 text-sm"
                        aria-label="Remove hero"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
                      <input
                        type="text"
                        value={hero.heading}
                        onChange={(e) => {
                          const newHeroes = [...content.expertLedPlantSelection.heroes];
                          newHeroes[idx] = { ...hero, heading: e.target.value };
                          setContent({ ...content, expertLedPlantSelection: { heroes: newHeroes } });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subheading</label>
                      <textarea
                        value={hero.subheading}
                        onChange={(e) => {
                          const newHeroes = [...content.expertLedPlantSelection.heroes];
                          newHeroes[originalIdx] = { ...hero, subheading: e.target.value };
                          setContent({ ...content, expertLedPlantSelection: { heroes: newHeroes } });
                        }}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <label className="flex-1">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleImageUpload("expertPlantHero", originalIdx, file);
                                }
                              }}
                              disabled={uploadingImages[`expertPlantHero-${originalIdx}`]}
                              className="hidden"
                            />
                            <span className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                              {uploadingImages[`expertPlantHero-${originalIdx}`] ? "Uploading..." : "Upload Image"}
                            </span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={hero.imageUrl}
                          onChange={(e) => {
                            const newHeroes = [...content.expertLedPlantSelection.heroes];
                            newHeroes[originalIdx] = { ...hero, imageUrl: e.target.value };
                            setContent({ ...content, expertLedPlantSelection: { heroes: newHeroes } });
                            // Clear portrait warning when URL changes
                            setPortraitWarnings((prev) => ({
                              ...prev,
                              [`expertPlantHero-${originalIdx}`]: false,
                            }));
                          }}
                          placeholder="Or enter image URL directly"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        {uploadErrors[`expertPlantHero-${originalIdx}`] && (
                          <p className="text-sm text-red-600">{uploadErrors[`expertPlantHero-${originalIdx}`]}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Recommended: landscape images (≥1600×900). Images are cropped automatically to fit.
                        </p>
                        {portraitWarnings[`expertPlantHero-${originalIdx}`] && (
                          <p className="text-sm text-amber-600 mt-1">
                            ⚠️ This image is portrait. Hero banners work best with landscape images. Portrait images will be cropped.
                          </p>
                        )}
                        {hero.imageUrl && (
                          <div className="mt-2">
                            <img
                              src={hero.imageUrl}
                              alt={`Expert Hero ${idx + 1} preview`}
                              className="max-w-full h-auto max-h-48 rounded-lg border border-gray-200"
                              onLoad={(e) => {
                                const img = e.target as HTMLImageElement;
                                const isPortrait = img.naturalHeight > img.naturalWidth;
                                setPortraitWarnings((prev) => ({
                                  ...prev,
                                  [`expertPlantHero-${originalIdx}`]: isPortrait,
                                }));
                              }}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                                setPortraitWarnings((prev) => ({
                                  ...prev,
                                  [`expertPlantHero-${originalIdx}`]: false,
                                }));
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
              })}
              
              {/* Add Hero Button */}
              {content.expertLedPlantSelection.heroes.length < MAX_HEROES && (
                <button
                  type="button"
                  onClick={() => handleAddHero("expertPlantHero")}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  + Add Hero
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Most Popular Plants */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setOpenSections({ ...openSections, mostPopularPlants: !openSections.mostPopularPlants })}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900">Most Popular Plants</h2>
          <span className="text-gray-500">{openSections.mostPopularPlants ? "▼" : "▶"}</span>
        </button>
        {openSections.mostPopularPlants && (
          <div className="px-6 pb-6">
            <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={content.mostPopularPlants.title}
              onChange={(e) =>
                setContent({
                  ...content,
                  mostPopularPlants: { ...content.mostPopularPlants, title: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Select Plants</label>
            
            {/* Selected Plants Grid - Default View */}
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
                      {content.mostPopularPlants.plantIds.length >= MAX_PLANTS ? "Replace" : "Add"}
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
          </div>
        )}
      </section>

      {/* Social Proof */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setOpenSections({ ...openSections, socialProof: !openSections.socialProof })}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900">Social Proof</h2>
          <span className="text-gray-500">{openSections.socialProof ? "▼" : "▶"}</span>
        </button>
        {openSections.socialProof && (
          <div className="px-6 pb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
                <input
                  type="text"
                  value={content.socialProof.headline}
                  onChange={(e) =>
                    setContent({ ...content, socialProof: { ...content.socialProof, headline: e.target.value } })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtext</label>
            <textarea
              value={content.socialProof.subtext}
              onChange={(e) =>
                setContent({ ...content, socialProof: { ...content.socialProof, subtext: e.target.value } })
              }
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
