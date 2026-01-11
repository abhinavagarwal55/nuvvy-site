import { getSupabaseAdmin } from "./server";

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
