"use client";

import { useState, useEffect, useCallback } from "react";

interface Hero {
  id: string;
  heading: string;
  subheading: string;
  imageUrl: string;
  order: number;
}

interface HeroCarouselProps {
  heroes: Hero[];
}

export default function HeroCarousel({ heroes }: HeroCarouselProps) {
  // Sort heroes by order
  const sortedHeroes = [...heroes].sort((a, b) => a.order - b.order);
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in pixels)
  const minSwipeDistance = 50;

  // Reset activeIndex when heroes change
  useEffect(() => {
    if (activeIndex >= sortedHeroes.length) {
      setActiveIndex(0);
    }
  }, [sortedHeroes.length, activeIndex]);

  // Auto-scroll effect
  useEffect(() => {
    // Disable auto-scroll if only one hero or paused
    if (sortedHeroes.length <= 1 || isPaused) {
      return;
    }

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % sortedHeroes.length);
    }, 3000); // 3 seconds

    return () => clearInterval(interval);
  }, [sortedHeroes.length, isPaused]);

  // Handle dot click
  const handleDotClick = useCallback((index: number) => {
    setActiveIndex(index);
    setIsPaused(true);
    // Resume auto-scroll after 10 seconds of inactivity
    setTimeout(() => setIsPaused(false), 10000);
  }, []);

  // Touch handlers for swipe
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && sortedHeroes.length > 1) {
      setActiveIndex((prev) => (prev + 1) % sortedHeroes.length);
      setIsPaused(true);
      setTimeout(() => setIsPaused(false), 10000);
    } else if (isRightSwipe && sortedHeroes.length > 1) {
      setActiveIndex((prev) => (prev - 1 + sortedHeroes.length) % sortedHeroes.length);
      setIsPaused(true);
      setTimeout(() => setIsPaused(false), 10000);
    }
  };

  const activeHero = sortedHeroes[activeIndex];

  if (!activeHero) {
    return null;
  }

  return (
    <section
      className="relative w-full aspect-[16/9] md:aspect-[16/9] min-h-[400px] overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Full-bleed background image */}
      <img
        src={activeHero.imageUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
      />
      {/* Dark gradient overlay at bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />

      {/* Content - Left aligned, absolutely positioned in lower third */}
      <div className="absolute bottom-12 left-6 right-6">
        <div className="max-w-2xl text-white">
          <h1 className="text-4xl md:text-5xl font-semibold mb-4 leading-tight">
            {activeHero.heading}
          </h1>
          <p className="text-lg md:text-xl text-white/90 mb-8">
            {activeHero.subheading}
          </p>
        </div>

        {/* Carousel dots - clickable if more than one hero */}
        {sortedHeroes.length > 1 && (
          <div className="flex gap-2 mt-6">
            {sortedHeroes.map((_, idx) => (
              <button
                key={idx}
                onClick={() => handleDotClick(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === activeIndex
                    ? "bg-white w-6"
                    : "bg-white/40 hover:bg-white/60"
                }`}
                aria-label={`Go to hero ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
