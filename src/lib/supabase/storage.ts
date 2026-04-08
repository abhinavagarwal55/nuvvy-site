import { getSupabaseAdmin } from "./server";

/**
 * Generate a signed URL for a file in Supabase Storage.
 * All photos/voice notes in the ops platform use relative paths in the DB.
 * This function converts those paths to time-limited signed URLs.
 *
 * @param bucket - Storage bucket name (e.g. 'nuvvy-ops')
 * @param path - Relative path stored in DB (e.g. 'visit-photos/uuid.jpg')
 * @param expiresIn - Seconds until URL expires (default: 1 hour)
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Batch-generate signed URLs for multiple paths in the same bucket.
 */
export async function getSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn = 3600
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresIn);

  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const item of data) {
    if (item.signedUrl && item.path) {
      map[item.path] = item.signedUrl;
    }
  }
  return map;
}

interface UploadExternalImageOptions {
  bucket: string;
  path: string;
  url: string;
}

/**
 * Download an external image and upload it to Supabase Storage
 * Returns the public URL of the uploaded file
 */
export async function uploadExternalImageToStorage({
  bucket,
  path,
  url,
}: UploadExternalImageOptions): Promise<string> {
  // Download the image
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "image/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  // Get content type from response or infer from URL
  let contentType = response.headers.get("content-type") || "image/jpeg";

  // Infer file extension from content type or URL
  let ext = ".jpg"; // default
  if (contentType.includes("png")) {
    ext = ".png";
  } else if (contentType.includes("gif")) {
    ext = ".gif";
  } else if (contentType.includes("webp")) {
    ext = ".webp";
  } else if (contentType.includes("svg")) {
    ext = ".svg";
  } else {
    // Try to infer from URL
    try {
      const urlObj = new URL(url);
      const urlPath = urlObj.pathname.toLowerCase();
      if (urlPath.endsWith(".png")) ext = ".png";
      else if (urlPath.endsWith(".gif")) ext = ".gif";
      else if (urlPath.endsWith(".webp")) ext = ".webp";
      else if (urlPath.endsWith(".svg")) ext = ".svg";
    } catch {
      // Keep default .jpg
    }
  }

  // Ensure path has correct extension
  const finalPath = path.endsWith(ext) ? path : `${path}${ext}`;

  // Get image data as ArrayBuffer
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload to Supabase Storage
  const supabase = getSupabaseAdmin();
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(finalPath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload to Supabase Storage: ${uploadError.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(finalPath);

  if (!urlData?.publicUrl) {
    throw new Error("Failed to get public URL from Supabase Storage");
  }

  return urlData.publicUrl;
}
