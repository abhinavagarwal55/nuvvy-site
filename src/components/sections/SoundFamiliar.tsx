"use client";

import { useState } from "react";
import { publicImage } from "@/lib/publicAssets";

interface SoundFamiliarProps {
  usePublicImage?: boolean;
}

export default function SoundFamiliar({ usePublicImage = true }: SoundFamiliarProps) {
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});

  const cards = [
    {
      title: "Plants not thriving",
      image: "/images/sound-familiar/plants not thriving_final.png",
    },
    {
      title: "Not sure what plants would work",
      image: "/images/sound-familiar/Not sure what works_final.png",
    },
    {
      title: "Care feels inconsistent",
      image: "/images/sound-familiar/Care feels inconsistent_final.png",
    },
    {
      title: "No time to manage",
      image: "/images/sound-familiar/not time to manage final.png",
    },
  ];

  // Helper to get image path - use publicImage if needed, otherwise plain path
  const getImagePath = (path: string) => {
    const basePath = usePublicImage ? publicImage(path) : path;
    // Use regular img tag with proper URL encoding for files with spaces
    // Next.js Image component can have issues with spaces in production
    return basePath;
  };

  const handleImageError = (idx: number) => {
    setImageErrors((prev) => ({ ...prev, [idx]: true }));
  };

  return (
    <section className="bg-white py-12">
      <div className="max-w-[640px] mx-auto px-4 md:px-6">
        <div className="mb-8 md:mb-12 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900">
            Does this sound familiar?
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-4 md:gap-6">
          {cards.map((card, idx) => (
            <div
              key={idx}
              className="overflow-hidden rounded-2xl bg-white shadow-sm"
            >
              <div className="relative aspect-[4/3] w-full bg-gray-100 overflow-hidden">
                {imageErrors[idx] ? (
                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">Image not available</span>
                  </div>
                ) : (
                  <img
                    src={getImagePath(card.image)}
                    alt={card.title}
                    className="w-full h-full object-cover"
                    onError={() => handleImageError(idx)}
                    loading="lazy"
                  />
                )}
              </div>
              <div className="px-3 py-2 md:px-4 md:py-3 bg-gray-200">
                <h3 className="text-sm font-semibold leading-snug text-gray-900 md:text-base">
                  {card.title}
                </h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
