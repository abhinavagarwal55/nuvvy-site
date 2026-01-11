"use client";

import { useState } from "react";
import Image from "next/image";

interface PlantImageProps {
  src: string | undefined | null;
  alt: string;
  fill?: boolean;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

/**
 * PlantImage component that handles Airtable images without Next.js optimization
 * Falls back to placeholder on error or empty URL
 */
export default function PlantImage({
  src,
  alt,
  fill = false,
  className = "",
  sizes,
  priority = false,
}: PlantImageProps) {
  const [imageError, setImageError] = useState(false);

  // Determine if this is an Airtable URL (only for unoptimized flag)
  const isAirtableUrl = (url: string | undefined | null): boolean => {
    if (!url) return false;
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes("airtableusercontent.com");
    } catch {
      return false;
    }
  };

  // Determine if this is a Supabase Storage URL (only for unoptimized flag)
  const isSupabaseStorageUrl = (url: string | undefined | null): boolean => {
    if (!url) return false;
    try {
      const urlObj = new URL(url);
      return (
        urlObj.hostname.includes("supabase.co") &&
        urlObj.pathname.includes("/storage/v1/object/public/")
      );
    } catch {
      return false;
    }
  };

  // Use provided src, fallback to placeholder only on error or if src is missing
  const finalSrc = imageError || !src ? "/images/plant-placeholder.svg" : src;
  const shouldUseUnoptimized = (isAirtableUrl(src) || isSupabaseStorageUrl(src)) && !imageError;

  // Common props
  const commonProps = {
    src: finalSrc,
    alt,
    className,
    onError: () => setImageError(true),
    priority,
  };

  // If using fill prop
  if (fill) {
    return (
      <Image
        {...commonProps}
        fill
        unoptimized={shouldUseUnoptimized}
        sizes={sizes}
      />
    );
  }

  // If not using fill, provide width/height
  return (
    <Image
      {...commonProps}
      width={400}
      height={400}
      unoptimized={shouldUseUnoptimized}
      sizes={sizes}
    />
  );
}
