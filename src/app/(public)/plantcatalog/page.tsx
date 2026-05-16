"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Leaf, ShoppingBag, ArrowLeft } from "lucide-react";
import PlantCard from "@/components/PlantCard";
import AccessoryCard from "@/components/AccessoryCard";
import AffiliateDisclosure from "@/components/AffiliateDisclosure";
import RailRow from "@/components/RailRow";
import { getCatalogStore, type PlantListItem, type PlantCategory, type AirPurifier } from "@/lib/catalog";
import { listActiveAccessoriesFromSupabase } from "@/lib/catalog/supabaseCatalogProductsStore";
import {
  listActiveRailsForSegmentFromSupabase,
  type PublicRailWithItems,
} from "@/lib/catalog/supabaseRailsStore";
import { getWhatsAppLink, CATALOG_SHORTLIST_REQUEST } from "@/config/whatsapp";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@/lib/catalog/catalogProductLabels";
import type {
  CatalogProduct,
  CatalogProductCategory,
} from "@/lib/catalog/catalogProductTypes";

type Segment = "plants" | "accessories";
type LightFilter = "All" | "full" | "partial" | "shade";

const VALID_CATEGORIES = new Set<PlantCategory>([
  "Indoor plant",
  "Flowering",
  "Creepers",
  "Aromatic",
  "Fruit Plants",
  "Vegetables",
]);

const LIGHT_LABELS: Record<Exclude<LightFilter, "All">, string> = {
  full: "Full sun",
  partial: "Partial",
  shade: "Mostly shade",
};

export default function PlantCatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const segment: Segment = searchParams.get("type") === "accessories" ? "accessories" : "plants";
  const shortlistToken = searchParams.get("shortlist") || null;

  // Helper: update one URL param without adding to history
  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "All" && value !== "") params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/plantcatalog?${qs}` : "/plantcatalog");
  };

  const setSegment = (next: Segment) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "plants") params.delete("type");
    else params.set("type", "accessories");
    const qs = params.toString();
    router.replace(qs ? `/plantcatalog?${qs}` : "/plantcatalog");
  };

  // Read initial filter state from URL
  const urlQ = searchParams.get("q") ?? "";
  const urlCategoryRaw = searchParams.get("category");
  const urlCategory: PlantCategory | "All" =
    urlCategoryRaw && VALID_CATEGORIES.has(urlCategoryRaw as PlantCategory)
      ? (urlCategoryRaw as PlantCategory)
      : "All";
  const urlAirPurifierRaw = searchParams.get("air_purifier");
  const urlAirPurifier: AirPurifier | "All" =
    urlAirPurifierRaw === "Yes" ? "Yes" : "All";
  const urlLightRaw = searchParams.get("light");
  const urlLight: LightFilter =
    urlLightRaw === "full" || urlLightRaw === "partial" || urlLightRaw === "shade"
      ? urlLightRaw
      : "All";

  const [plants, setPlants] = useState<PlantListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState(urlQ);
  const [selectedCategory, setSelectedCategory] = useState<PlantCategory | "All">(urlCategory);
  const [selectedAirPurifier, setSelectedAirPurifier] = useState<AirPurifier | "All">(urlAirPurifier);
  const [selectedLight, setSelectedLight] = useState<LightFilter>(urlLight);
  const [loading, setLoading] = useState(true);

  // Debounce search input → URL (~250ms)
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchQuery !== urlQ) {
        updateParam("q", searchQuery.trim() || null);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Accessories state (used only when segment === 'accessories')
  const [accessories, setAccessories] = useState<CatalogProduct[]>([]);
  const [accLoading, setAccLoading] = useState(false);
  const [accCategory, setAccCategory] = useState<CatalogProductCategory | "All">("All");
  const [accSearch, setAccSearch] = useState("");
  const [accSort, setAccSort] = useState<"curated" | "price_asc" | "price_desc">("curated");

  // CE1: curated rails for the active segment
  const [rails, setRails] = useState<PublicRailWithItems[]>([]);
  const [railsLoading, setRailsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRailsLoading(true);
    listActiveRailsForSegmentFromSupabase(segment)
      .then((data) => { if (!cancelled) setRails(data); })
      .finally(() => { if (!cancelled) setRailsLoading(false); });
    return () => { cancelled = true; };
  }, [segment]);

  // Rails hide when any filter or search is engaged — discovery vs. retrieval
  const hasActivePlantFilter =
    searchQuery.trim() !== "" ||
    selectedCategory !== "All" ||
    selectedAirPurifier !== "All" ||
    selectedLight !== "All";
  const hasActiveAccFilter = accSearch.trim() !== "" || accCategory !== "All";
  const showRails =
    !railsLoading &&
    rails.length > 0 &&
    (segment === "plants" ? !hasActivePlantFilter : !hasActiveAccFilter);

  useEffect(() => {
    if (segment !== "accessories") return;
    let cancelled = false;
    setAccLoading(true);
    listActiveAccessoriesFromSupabase({
      category: accCategory === "All" ? null : accCategory,
      q: accSearch.trim() || null,
      sort: accSort,
    })
      .then((data) => { if (!cancelled) setAccessories(data); })
      .finally(() => { if (!cancelled) setAccLoading(false); });
    return () => { cancelled = true; };
  }, [segment, accCategory, accSearch, accSort]);

  useEffect(() => {
    if (segment === "accessories") {
      document.title = "Garden Accessories — Nuvvy";
    } else {
      document.title = "Nuvvy Plant Catalog";
    }
  }, [segment]);

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

      // Light filter: case-insensitive substring match against plant.light
      const plantLight = (plant.light || "").toLowerCase();
      const matchesLight =
        selectedLight === "All" ||
        (selectedLight === "full" && (plantLight.includes("full") || plantLight.includes("direct"))) ||
        (selectedLight === "partial" && (plantLight.includes("partial") || plantLight.includes("bright indirect") || plantLight.includes("medium"))) ||
        (selectedLight === "shade" && (plantLight.includes("shade") || plantLight.includes("low light")));

      return matchesSearch && matchesCategory && matchesAirPurifier && matchesLight;
    });
  }, [plants, searchQuery, selectedCategory, selectedAirPurifier, selectedLight]);

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
      {/* Return-to-shortlist banner */}
      {shortlistToken && (
        <div className="bg-leaf text-white sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-3 md:px-6 py-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium">
              Browsing for your shortlist
            </span>
            <a
              href={`/s/${shortlistToken}`}
              className="inline-flex items-center gap-1 bg-white text-leaf text-xs md:text-sm font-semibold px-3 py-1.5 rounded-full hover:bg-white/90 whitespace-nowrap"
            >
              <ArrowLeft size={14} />
              Back to shortlist
            </a>
          </div>
        </div>
      )}

      <section className="py-6 md:py-12">
        <div className="max-w-6xl mx-auto px-3 md:px-6">
          <div className="bg-[#F9FAFB] rounded-2xl md:rounded-3xl border border-gray-200 p-3 md:p-7">
            {/* Breadcrumb */}
            <div className="mb-2 text-sm text-gray-500">
              <a href="/" className="hover:underline">Home</a>
              <span className="mx-2">/</span>
              <span className="text-gray-700">Plant Catalog</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-green-dark mt-1 mb-1">
              Plant Catalog
            </h1>
            <p className="text-sm md:text-base text-gray-600 mb-4">
              Curated for Bangalore balconies
            </p>

            {/* Segment toggle — equal-weight buttons so Accessories is visible */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setSegment("plants")}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border-2 transition-all ${
                  segment === "plants"
                    ? "bg-leaf text-white border-leaf shadow-sm"
                    : "bg-white text-leaf border-leaf/40 hover:border-leaf"
                }`}
                aria-pressed={segment === "plants"}
              >
                <Leaf size={16} />
                Plants
              </button>
              <button
                type="button"
                onClick={() => setSegment("accessories")}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border-2 transition-all ${
                  segment === "accessories"
                    ? "bg-leaf text-white border-leaf shadow-sm"
                    : "bg-white text-leaf border-leaf/40 hover:border-leaf"
                }`}
                aria-pressed={segment === "accessories"}
              >
                <ShoppingBag size={16} />
                Accessories
              </button>
            </div>

            {/* CE1: curated rails (hidden when any filter is active) */}
            {showRails && (
              <div className="space-y-4 mb-4">
                {rails.map((rail) => (
                  <RailRow key={rail.id} rail={rail} />
                ))}
              </div>
            )}

            {segment === "accessories" ? (
              <AccessoriesSegment
                accessories={accessories}
                loading={accLoading}
                category={accCategory}
                onCategoryChange={setAccCategory}
                search={accSearch}
                onSearchChange={setAccSearch}
                sort={accSort}
                onSortChange={setAccSort}
              />
            ) : (
            <>
            {/* Search and Filters Section */}
            <div className="py-2 mb-3">
              {/* Search Input */}
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Search plants..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-green focus:border-transparent"
                />
              </div>

              {/* Filter Chips */}
              <div className="space-y-2">
                {/* Category Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                  <div className="flex gap-2 overflow-x-auto whitespace-nowrap -mx-3 md:-mx-7 px-3 md:px-7 scrollbar-hide flex-nowrap" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                    <button
                      onClick={() => { setSelectedCategory("All"); updateParam("category", null); }}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
                        onClick={() => { setSelectedCategory(cat); updateParam("category", cat); }}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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

                {/* Light Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Light</label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { setSelectedLight("All"); updateParam("light", null); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        selectedLight === "All"
                          ? "bg-green text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      All
                    </button>
                    {(["full", "partial", "shade"] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setSelectedLight(opt); updateParam("light", opt); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          selectedLight === opt
                            ? "bg-green text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {LIGHT_LABELS[opt]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Air Purifier Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Air Purifier</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setSelectedAirPurifier("All"); updateParam("air_purifier", null); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        selectedAirPurifier === "All"
                          ? "bg-green text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => { setSelectedAirPurifier("Yes"); updateParam("air_purifier", "Yes"); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
            <div className="pt-2">
              {loading ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">Loading plants...</p>
                </div>
              ) : filteredPlants.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">No plants found matching your filters.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-600 mb-2">
                    Showing {filteredPlants.length} {filteredPlants.length === 1 ? "plant" : "plants"}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                    {filteredPlants.map((plant) => (
                      <PlantCard key={plant.id} plant={plant} />
                    ))}
                  </div>
                </>
              )}
            </div>
            </>
            )}
          </div>
        </div>
      </section>

      {/* Bottom CTA Section — CE3: custom shortlist via WhatsApp */}
      <section className="py-6 md:py-10">
        <div className="max-w-6xl mx-auto px-3 md:px-6">
          <div className="bg-[#F9FAFB] rounded-2xl md:rounded-3xl border border-gray-200 p-4 md:p-8 text-center">
            <h2 className="text-xl md:text-2xl font-semibold text-gray-900">
              Want plants picked for your balcony specifically?
            </h2>
            <p className="mt-2 text-sm md:text-base text-gray-600 max-w-2xl mx-auto">
              Tell us about your space and our horticulturist will build you a custom shortlist.
            </p>
            <a
              href={getWhatsAppLink(CATALOG_SHORTLIST_REQUEST)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 bg-leaf text-white font-semibold py-3 px-6 rounded-full hover:bg-leaf/90 transition-colors"
            >
              Get a custom shortlist on WhatsApp
            </a>
            <div className="mt-3">
              <a href="/#garden-care" className="text-xs md:text-sm text-gray-600 hover:underline">
                Already know what you want? See garden care plans →
              </a>
            </div>
          </div>
        </div>
      </section>

      {segment === "accessories" && (
        <section className="pb-10 md:pb-12">
          <div className="max-w-6xl mx-auto px-3 md:px-6">
            <AffiliateDisclosure subtle />
          </div>
        </section>
      )}
    </main>
  );
}

function AccessoriesSegment({
  accessories,
  loading,
  category,
  onCategoryChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
}: {
  accessories: CatalogProduct[];
  loading: boolean;
  category: CatalogProductCategory | "All";
  onCategoryChange: (c: CatalogProductCategory | "All") => void;
  search: string;
  onSearchChange: (s: string) => void;
  sort: "curated" | "price_asc" | "price_desc";
  onSortChange: (s: "curated" | "price_asc" | "price_desc") => void;
}) {
  return (
    <>
      <div className="mb-3">
        <AffiliateDisclosure />
      </div>

      <div className="py-2 mb-3">
        {/* Search */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search accessories..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-green focus:border-transparent"
          />
        </div>

        {/* Category chips */}
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Category
            </label>
            <div
              className="flex gap-2 overflow-x-auto whitespace-nowrap -mx-3 md:-mx-7 px-3 md:px-7 scrollbar-hide flex-nowrap"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <button
                onClick={() => onCategoryChange("All")}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  category === "All"
                    ? "bg-green text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              {CATEGORY_ORDER.map((c) => (
                <button
                  key={c}
                  onClick={() => onCategoryChange(c)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    category === c
                      ? "bg-green text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-700">Sort</label>
            <select
              value={sort}
              onChange={(e) =>
                onSortChange(e.target.value as "curated" | "price_asc" | "price_desc")
              }
              className="rounded-xl border border-gray-300 px-2.5 py-1 text-xs focus:ring-2 focus:ring-green focus:border-transparent"
            >
              <option value="curated">Nuvvy curated</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
            </select>
          </div>
        </div>
      </div>

      <div className="pt-2">
        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-600">Loading accessories...</p>
          </div>
        ) : accessories.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600">No accessories match your filters yet.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-600 mb-2">
              Showing {accessories.length}{" "}
              {accessories.length === 1 ? "product" : "products"}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {accessories.map((p) => (
                <AccessoryCard key={p.id} product={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
