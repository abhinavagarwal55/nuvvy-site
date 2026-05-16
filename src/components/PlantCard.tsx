import Link from "next/link";
import PlantImage from "@/components/PlantImage";
import type { PlantListItem } from "@/lib/catalog";

type Size = "default" | "compact";

/**
 * Trim leading/trailing quote characters from a string. Some
 * horticulturist notes were copied from documents with curly quotes.
 */
function unquote(s: string): string {
  return s.trim().replace(/^["'‘’“”]|["'‘’“”]$/g, "").trim();
}

export default function PlantCard({
  plant,
  size = "default",
}: {
  plant: PlantListItem;
  size?: Size;
}) {
  const noteRaw = plant.horticulturistNotes;
  const note = noteRaw ? unquote(noteRaw) : "";
  const showNote = size === "default" && note.length > 0;

  if (size === "compact") {
    return (
      <Link
        href={`/plantcatalog/${plant.id}`}
        className="group block w-[140px] md:w-[200px] flex-shrink-0 rounded-xl border border-gray-100 bg-white overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
      >
        <div className="aspect-square relative bg-gray-100">
          <PlantImage
            src={plant.thumbnailUrl}
            alt={plant.name}
            fill
            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 140px, 200px"
          />
        </div>
        <div className="p-3">
          <h3 className="font-semibold text-green-dark text-sm leading-tight line-clamp-2 whitespace-normal">
            {plant.name}
          </h3>
          {plant.price_band && (
            <p className="text-xs font-semibold text-green-800 mt-1">
              {plant.price_band}
            </p>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/plantcatalog/${plant.id}`}
      className="group block rounded-xl border border-gray-100 bg-white transition-all duration-200 hover:shadow-lg hover:-translate-y-1 overflow-hidden"
    >
      <div className="aspect-square relative bg-gray-100">
        <PlantImage
          src={plant.thumbnailUrl}
          alt={plant.name}
          fill
          className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-green-dark text-base leading-tight line-clamp-2">{plant.name}</h3>
        {plant.price_band && (
          <p className="text-sm font-semibold text-green-800 mt-0.5">
            {plant.price_band}
          </p>
        )}
        <p className="text-xs text-gray-600 mt-0.5">
          {plant.category} • {plant.light}
        </p>
        {showNote && (
          <p className="text-xs italic text-ink/70 line-clamp-1 mt-0.5">
            {note}
          </p>
        )}
      </div>
    </Link>
  );
}
