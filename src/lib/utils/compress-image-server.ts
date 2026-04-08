import sharp from "sharp";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const heicConvert = require("heic-convert");

/**
 * Detect if a buffer is HEIC/HEIF format by checking magic bytes.
 */
function isHeic(buffer: Buffer): boolean {
  // HEIC/HEIF files have "ftyp" at offset 4 followed by heic/heix/mif1/msf1
  if (buffer.length < 12) return false;
  const ftyp = buffer.toString("ascii", 4, 8);
  if (ftyp !== "ftyp") return false;
  const brand = buffer.toString("ascii", 8, 12);
  return ["heic", "heix", "mif1", "msf1", "hevc"].includes(brand);
}

/**
 * Compress an image buffer to fit under maxSizeBytes.
 * Handles HEIC/HEIF by converting to JPEG first via heic-convert.
 * Returns the compressed buffer and content type.
 */
export async function compressImageServer(
  buffer: Buffer,
  maxSizeBytes = 500 * 1024
): Promise<{ buffer: Buffer; contentType: string }> {
  // Convert HEIC/HEIF to JPEG before processing with sharp
  let inputBuffer = buffer;
  if (isHeic(buffer)) {
    const converted = await heicConvert({
      buffer: buffer as unknown as ArrayBuffer,
      format: "JPEG",
      quality: 0.9,
    });
    inputBuffer = Buffer.from(converted);
  }

  // First attempt: resize to max 1200px and quality 80
  let result = await sharp(inputBuffer)
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  if (result.length <= maxSizeBytes) {
    return { buffer: result, contentType: "image/jpeg" };
  }

  // Second attempt: lower quality
  for (const quality of [60, 45, 30]) {
    result = await sharp(inputBuffer)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();

    if (result.length <= maxSizeBytes) {
      return { buffer: result, contentType: "image/jpeg" };
    }
  }

  // Final attempt: smaller dimensions + low quality
  result = await sharp(inputBuffer)
    .resize(800, 800, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 30 })
    .toBuffer();

  return { buffer: result, contentType: "image/jpeg" };
}
