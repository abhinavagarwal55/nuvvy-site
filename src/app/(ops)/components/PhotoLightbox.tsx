"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react";

type Photo = {
  url: string;
  alt?: string;
};

export default function PhotoLightbox({
  photos,
  initialIndex = 0,
  onClose,
}: {
  photos: Photo[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index];

  const goNext = useCallback(() => {
    if (index < photos.length - 1) setIndex(index + 1);
  }, [index, photos.length]);

  const goPrev = useCallback(() => {
    if (index > 0) setIndex(index - 1);
  }, [index]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goNext, goPrev]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  async function handleDownload() {
    try {
      const res = await fetch(photo.url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `photo-${index + 1}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // Fallback: open in new tab
      window.open(photo.url, "_blank");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex flex-col"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-white/70 text-sm">
          {index + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownload}
            className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            title="Download"
          >
            <Download size={20} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="flex-1 flex items-center justify-center px-12 pb-6 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prev arrow */}
        {photos.length > 1 && (
          <button
            onClick={goPrev}
            disabled={index === 0}
            className="absolute left-2 md:left-4 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white disabled:opacity-20 disabled:cursor-default transition-colors z-10"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        <img
          src={photo.url}
          alt={photo.alt ?? `Photo ${index + 1}`}
          className="max-h-full max-w-full object-contain rounded-lg"
        />

        {/* Next arrow */}
        {photos.length > 1 && (
          <button
            onClick={goNext}
            disabled={index === photos.length - 1}
            className="absolute right-2 md:right-4 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white disabled:opacity-20 disabled:cursor-default transition-colors z-10"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>
  );
}
