import Link from "next/link";
import PlantCard from "@/components/PlantCard";
import AccessoryCard from "@/components/AccessoryCard";
import type { PublicRailWithItems } from "@/lib/catalog/supabaseRailsStore";

export default function RailRow({ rail }: { rail: PublicRailWithItems }) {
  const hasCta = Boolean(rail.cta_label?.trim() && rail.cta_link?.trim());

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-3 md:p-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-ink">{rail.title}</h2>
          {rail.subtitle && (
            <p className="text-xs text-gray-600 mt-0.5">{rail.subtitle}</p>
          )}
        </div>
        {hasCta && (
          <Link
            href={rail.cta_link!}
            className="hidden sm:inline-block text-sm font-medium text-leaf hover:underline whitespace-nowrap"
          >
            {rail.cta_label} →
          </Link>
        )}
      </div>

      <div
        className="flex gap-2 overflow-x-auto whitespace-nowrap -mx-3 md:-mx-4 px-3 md:px-4 pb-1 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {rail.segment === "plants"
          ? rail.items.map((plant) => (
              <PlantCard key={plant.id} plant={plant} size="compact" />
            ))
          : rail.items.map((product) => (
              <AccessoryCard key={product.id} product={product} compact />
            ))}

        {hasCta && (
          <Link
            href={rail.cta_link!}
            className="flex-shrink-0 w-[140px] md:w-[200px] flex items-center justify-center rounded-xl border border-dashed border-leaf/40 text-leaf text-sm font-medium hover:bg-mist hover:border-leaf"
          >
            See all →
          </Link>
        )}
      </div>
    </section>
  );
}
