/**
 * Compress an image file to fit under maxSizeBytes using canvas.
 * Progressively reduces quality and dimensions until under the limit.
 * If the browser can't decode the format (e.g. HEIC), returns the
 * original file and lets the server-side compressor handle it.
 */
export async function compressImage(
  file: File,
  maxSizeBytes = 500 * 1024
): Promise<File> {
  // If already small enough, return as-is
  if (file.size <= maxSizeBytes) return file;

  let img: ImageBitmap;
  try {
    img = await createImageBitmap(file);
  } catch {
    // Browser can't decode this format (HEIC, HEIF, etc.)
    // Return original — server-side sharp will handle conversion
    return file;
  }

  const maxDim = 1200; // max width or height

  let width = img.width;
  let height = img.height;

  // Scale down if larger than maxDim
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);

  // Try decreasing quality until under limit
  for (let quality = 0.8; quality >= 0.3; quality -= 0.1) {
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/jpeg", quality)
    );
    if (blob.size <= maxSizeBytes) {
      return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
        type: "image/jpeg",
      });
    }
  }

  // If still too large, scale down further
  const ratio = 0.5;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.5)
  );
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
  });
}
