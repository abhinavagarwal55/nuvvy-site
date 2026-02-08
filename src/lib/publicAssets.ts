/**
 * Helper to generate public asset paths that respect NEXT_PUBLIC_BASE_PATH.
 * 
 * Use this for images and other static assets in the /public directory.
 * 
 * @param path - Path starting with "/" (e.g., "/images/logo.png")
 * @returns Path with basePath prefix if configured
 * 
 * @example
 * publicImage("/images/logo.png") // "/images/logo.png" or "/base-path/images/logo.png"
 */
export function publicImage(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`publicImage: path must start with "/", got: ${path}`);
  }

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
  
  if (!basePath) {
    return path;
  }

  // Remove trailing slash from basePath if present
  const cleanBasePath = basePath.replace(/\/$/, "");
  
  // Ensure path starts with "/"
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  
  return `${cleanBasePath}${cleanPath}`;
}
