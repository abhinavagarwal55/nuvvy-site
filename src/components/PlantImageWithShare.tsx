"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Share2 } from "lucide-react";

interface PlantImageWithShareProps {
  src: string | undefined | null;
  alt: string;
  fill?: boolean;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

/**
 * PlantImage component with Share button overlay
 * Share button appears bottom-right on the image
 */
export default function PlantImageWithShare({
  src,
  alt,
  fill = false,
  className = "",
  sizes,
  priority = false,
}: PlantImageWithShareProps) {
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  // Get current page URL on client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, []);

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

  // Handle share action
  const handleShare = async () => {
    // Check if navigator.share is available (mobile)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: alt,
          url: shareUrl,
        });
      } catch (error) {
        // User cancelled or error occurred - silently fail
        console.error("Share failed:", error);
      }
    } else {
      // Desktop: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Copy failed:", error);
      }
    }
  };

  // Common props for Image
  const commonProps = {
    src: finalSrc,
    alt,
    className,
    onError: () => setImageError(true),
    priority,
  };

  return (
    <div className="relative w-full h-full">
      {fill ? (
        <Image
          {...commonProps}
          fill
          unoptimized={shouldUseUnoptimized}
          sizes={sizes}
        />
      ) : (
        <Image
          {...commonProps}
          width={400}
          height={400}
          unoptimized={shouldUseUnoptimized}
          sizes={sizes}
        />
      )}

      {/* Share Button - Bottom Right */}
      <button
        onClick={handleShare}
        className="absolute bottom-3 right-3 bg-white rounded-full p-3 shadow-lg hover:shadow-xl transition-shadow focus:outline-none focus:ring-2 focus:ring-green focus:ring-offset-2 z-10"
        aria-label="Share plant"
      >
        <Share2 className="w-5 h-5 text-gray-700" />
      </button>

      {/* Copy Feedback */}
      {copied && (
        <div className="absolute bottom-16 right-3 bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg z-10 animate-in fade-in duration-200">
          Link copied
        </div>
      )}
    </div>
  );
}
