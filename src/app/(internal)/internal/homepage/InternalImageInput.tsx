"use client";

import { useState, useRef, useEffect } from "react";

interface InternalImageInputProps {
  value: string | null | undefined;
  onChange: (url: string) => void;
  label: string;
}

export default function InternalImageInput({
  value,
  onChange,
  label,
}: InternalImageInputProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset image error when URL changes
  useEffect(() => {
    setImageError(false);
  }, [value]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/internal/homepage/upload-image", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to upload image");
      }

      onChange(result.data.url);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to upload image"
      );
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const imageUrl = value || "";

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>

      {/* Image Preview */}
      {imageUrl && (
        <div className="w-full max-w-[240px] aspect-[4/3] rounded-lg border border-gray-300 overflow-hidden bg-gray-50">
          {!imageError ? (
            <img
              src={imageUrl}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
              Failed to load image
            </div>
          )}
        </div>
      )}

      {/* Upload Button */}
      <div>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? "Uploading..." : "Upload Image"}
        </button>
        {uploadError && (
          <p className="mt-1 text-xs text-red-600">{uploadError}</p>
        )}
      </div>

      {/* URL Input */}
      <input
        type="text"
        value={imageUrl}
        onChange={(e) => {
          setImageError(false);
          onChange(e.target.value);
        }}
        placeholder="Or paste image URL"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
    </div>
  );
}
