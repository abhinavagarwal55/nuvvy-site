"use client";
import { ReactNode } from "react";
import { Leaf, Lightbulb, Flower2, Droplets, Sparkles, Hammer } from "lucide-react";

export type FeatureIcon =
  | "leaf" | "lightbulb" | "flower" | "droplets" | "sparkles" | "hammer";

export type Feature = { text: string; icon: FeatureIcon };

const iconMap: Record<FeatureIcon, ReactNode> = {
  leaf: <Leaf className="h-4 w-4 text-emerald-600" />,
  lightbulb: <Lightbulb className="h-4 w-4 text-emerald-600" />,
  flower: <Flower2 className="h-4 w-4 text-emerald-600" />,
  droplets: <Droplets className="h-4 w-4 text-emerald-600" />,
  sparkles: <Sparkles className="h-4 w-4 text-emerald-600" />,
  hammer: <Hammer className="h-4 w-4 text-emerald-600" />,
};

export default function PackageCard({
  title,
  price,
  subtitle,
  features,
  badge,
}: {
  title: string;
  price: string;       // e.g. "₹15,000–₹20,000" or "Custom"
  subtitle?: string;   // optional subtitle under price
  features: Feature[]; // list with icon + text
  badge?: string;      // e.g. "Most Popular"
}) {
  const isFeatured = !!badge;
  const containerClass = isFeatured
    ? "relative rounded-3xl border transition-all duration-300 ease-out p-6 space-y-4 bg-white border-emerald-200 shadow-md ring-2 ring-emerald-200 hover:shadow-lg hover:-translate-y-0.5"
    : "relative rounded-3xl border transition-all duration-300 ease-out p-6 space-y-4 bg-white border-emerald-100 shadow-sm hover:shadow-md hover:-translate-y-0.5";

  return (
    <div className={containerClass}>
      {badge ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-1 text-[13px] font-semibold text-white shadow-sm shadow-emerald-300">
          {badge}
        </div>
      ) : null}

      <h3 className="text-lg font-semibold text-emerald-900">{title}</h3>
      
      <div>
        <div className="text-2xl font-bold tracking-tight text-gray-900">{price}</div>
        {subtitle ? <div className="text-sm text-gray-600">{subtitle}</div> : null}
      </div>

      <ul className="space-y-2">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-gray-800 transition-transform hover:scale-[1.02]">
            {iconMap[f.icon]}
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
