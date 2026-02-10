"use client";

import HeroCarousel from "@/components/HeroCarousel";

interface Hero {
  id: string;
  heading: string;
  subheading: string;
  imageUrl: string;
  order: number;
}

interface ClassicHeroProps {
  heroes: Hero[];
}

/**
 * Classic hero component - wraps the existing HeroCarousel
 * This preserves the current hero behavior exactly as-is
 */
export default function ClassicHero({ heroes }: ClassicHeroProps) {
  return <HeroCarousel heroes={heroes} />;
}
