import { buildAffiliateUrl } from "@/lib/catalog/affiliate";
import { CATEGORY_LABELS, formatPriceInr } from "@/lib/catalog/catalogProductLabels";
import type {
  CatalogProduct,
  CatalogProductCategory,
} from "@/lib/catalog/catalogProductTypes";

export default function AccessoryCard({
  product: p,
  compact = false,
}: {
  product: CatalogProduct;
  compact?: boolean;
}) {
  const href = buildAffiliateUrl({
    amazon_asin: p.amazon_asin,
    amazon_url: p.amazon_url,
  });
  const img =
    p.thumbnail_storage_url ||
    p.thumbnail_url ||
    p.image_storage_url ||
    p.image_url ||
    null;

  const snapshot = p.price_snapshot_at
    ? new Date(p.price_snapshot_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  if (compact) {
    return (
      <div className="group block w-[160px] md:w-[200px] flex-shrink-0 rounded-xl border border-gray-100 bg-white overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 flex flex-col">
        <div className="aspect-square relative bg-gray-100">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={p.name}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
              No image
            </div>
          )}
        </div>
        <div className="p-3 flex flex-col gap-1 flex-1">
          <h3 className="font-semibold text-ink text-sm leading-tight line-clamp-2 whitespace-normal">
            {p.name}
          </h3>
          {p.price_inr != null && (
            <p className="text-xs font-semibold text-leaf">{formatPriceInr(p.price_inr)}</p>
          )}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="mt-auto block text-center bg-leaf text-white text-xs font-medium py-1.5 rounded-md hover:bg-leaf/90"
            >
              Buy on Amazon
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group block rounded-xl border border-gray-100 bg-white transition-all duration-200 hover:shadow-lg hover:-translate-y-1 overflow-hidden flex flex-col">
      <div className="aspect-square relative bg-gray-100">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={p.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            No image
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-0.5 flex-1">
        <h3 className="font-semibold text-ink text-sm leading-tight line-clamp-2">{p.name}</h3>
        {p.brand && <p className="text-[11px] italic text-gray-500">{p.brand}</p>}
        <p className="text-[11px] text-gray-600">
          {CATEGORY_LABELS[p.category as CatalogProductCategory]}
        </p>
        {p.price_inr != null && (
          <p
            className="text-sm font-semibold text-leaf mt-0.5"
            title={snapshot ? `Price as of ${snapshot}` : undefined}
          >
            {formatPriceInr(p.price_inr)}
            {snapshot && (
              <span className="ml-1 text-[10px] font-normal text-gray-500">
                as of {snapshot}
              </span>
            )}
          </p>
        )}
        <div className="mt-auto pt-2">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="block w-full text-center bg-leaf text-white font-medium text-xs py-1.5 rounded-lg hover:bg-leaf/90 transition-colors"
            >
              Buy on Amazon
            </a>
          ) : (
            <p className="text-center text-[11px] text-gray-400 italic py-1.5">
              Link unavailable
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
