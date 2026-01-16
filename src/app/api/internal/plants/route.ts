import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { getInternalAccess } from "@/lib/internal/authz";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// Force Node.js runtime for this route
export const runtime = "nodejs";

// Helper function to check auth (used by both GET and POST)
async function checkAuth(): Promise<{ authorized: boolean; error?: string; status?: number }> {
  // DEV-ONLY: Auth bypass for local development
  const isDevBypass =
    (process.env.INTERNAL_AUTH_BYPASS === "true" ||
      process.env.INTERNAL_AUTH_BYPASS === "1") &&
    process.env.NODE_ENV !== "production";

  if (isDevBypass) {
    return { authorized: true };
  }

  // Production path: Check authentication
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return { authorized: false, error: "Unauthorized", status: 401 };
  }

  if (!user.email) {
    return { authorized: false, error: "Forbidden: Missing user email", status: 403 };
  }

  const access = await getInternalAccess(user.email);
  if (!access) {
    return { authorized: false, error: "Forbidden: Access denied", status: 403 };
  }

  return { authorized: true };
}

export async function GET(request: NextRequest) {
  try {
    const authCheck = await checkAuth();
    if (!authCheck.authorized) {
      return NextResponse.json(
        { data: null, error: authCheck.error },
        { status: authCheck.status || 401 }
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const searchQuery = searchParams.get("q");
    const publishedParam = searchParams.get("published"); // "all" | "published" | "non_published"
    const publishedOnlyParam = searchParams.get("publishedOnly"); // Legacy support
    const sortParam = searchParams.get("sort");
    const dirParam = searchParams.get("dir");

    // Parse limit (default 25, max 10000 for "show all" case)
    let limit = 25;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 10000);
      }
    }

    // Parse offset (default 0)
    let offset = 0;
    if (offsetParam) {
      const parsed = parseInt(offsetParam, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        offset = parsed;
      }
    }

    // Parse published filter
    // Support both new "published" param and legacy "publishedOnly"
    let publishedFilter: "all" | "published" | "non_published" = "all";
    if (publishedParam) {
      if (publishedParam === "published" || publishedParam === "non_published" || publishedParam === "all") {
        publishedFilter = publishedParam;
      }
    } else if (publishedOnlyParam === "true") {
      publishedFilter = "published";
    }

    // Parse sort (default: updated_at desc)
    const sortColumn = sortParam || "updated_at";
    const sortDir = dirParam === "asc" ? "asc" : "desc";

    const adminSupabase = createAdminSupabaseClient();

    // Build base query with count
    let query = adminSupabase.from("plants").select("*", { count: "exact" });

    // Apply search filter if provided
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim();
      query = query.or(`name.ilike.%${searchTerm}%,scientific_name.ilike.%${searchTerm}%`);
    }

    // Apply published filter
    if (publishedFilter === "published") {
      query = query.eq("can_be_procured", true);
    } else if (publishedFilter === "non_published") {
      query = query.eq("can_be_procured", false);
    }
    // "all" - no filter needed

    // Apply sorting
    query = query.order(sortColumn, { ascending: sortDir === "asc", nullsFirst: false });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error("GET /api/internal/plants failed: Supabase query error", error);
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    // Return new shape: { plants, totalCount }
    return NextResponse.json(
      { 
        data: data || [],
        totalCount: count || 0,
        error: null 
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/internal/plants failed", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authCheck = await checkAuth();
    if (!authCheck.authorized) {
      return NextResponse.json(
        { data: null, error: authCheck.error },
        { status: authCheck.status || 401 }
      );
    }

    const formData = await request.formData();
    const nameRaw = formData.get("name") as string | null;
    const scientific_nameRaw = formData.get("scientific_name") as string | null;
    const categoryRaw = formData.get("category") as string | null;
    const lightRaw = formData.get("light") as string | null;
    const watering_requirementRaw = formData.get("watering_requirement") as string | null;
    const fertilization_requirementRaw = formData.get("fertilization_requirement") as string | null;
    const soil_mixRaw = formData.get("soil_mix") as string | null;
    const toxicityRaw = formData.get("toxicity") as string | null;
    const lifespanRaw = formData.get("lifespan") as string | null;
    const horticulturist_notesRaw = formData.get("horticulturist_notes") as string | null;
    const imageFile = formData.get("image") as File | null;

    // Trim and validate ALL required fields
    const name = nameRaw?.trim() || "";
    const scientific_name = scientific_nameRaw?.trim() || "";
    const category = categoryRaw?.trim() || "";
    const light = lightRaw?.trim() || "";
    const watering_requirement = watering_requirementRaw?.trim() || "";
    const fertilization_requirement = fertilization_requirementRaw?.trim() || "";
    const soil_mix = soil_mixRaw?.trim() || "";
    const toxicity = toxicityRaw?.trim() || "";
    const lifespan = lifespanRaw?.trim() || "";
    const horticulturist_notes = horticulturist_notesRaw?.trim() || "";

    // Validate can_be_procured is explicitly set (boolean)
    const can_be_procuredValue = formData.get("can_be_procured");
    if (can_be_procuredValue !== "true" && can_be_procuredValue !== "false") {
      return NextResponse.json(
        { data: null, error: "can_be_procured must be explicitly set to true or false" },
        { status: 400 }
      );
    }
    const can_be_procured = can_be_procuredValue === "true";

    // Validate all required string fields
    if (!name) {
      return NextResponse.json(
        { data: null, error: "Name is required" },
        { status: 400 }
      );
    }

    if (!scientific_name) {
      return NextResponse.json(
        { data: null, error: "Scientific name is required" },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { data: null, error: "Category is required" },
        { status: 400 }
      );
    }

    if (!light) {
      return NextResponse.json(
        { data: null, error: "Light condition is required" },
        { status: 400 }
      );
    }

    if (!watering_requirement) {
      return NextResponse.json(
        { data: null, error: "Watering requirement is required" },
        { status: 400 }
      );
    }

    if (!fertilization_requirement) {
      return NextResponse.json(
        { data: null, error: "Fertilization requirement is required" },
        { status: 400 }
      );
    }

    if (!soil_mix) {
      return NextResponse.json(
        { data: null, error: "Soil mix is required" },
        { status: 400 }
      );
    }

    if (!toxicity) {
      return NextResponse.json(
        { data: null, error: "Toxicity is required" },
        { status: 400 }
      );
    }

    if (!lifespan) {
      return NextResponse.json(
        { data: null, error: "Lifespan is required" },
        { status: 400 }
      );
    }

    if (!horticulturist_notes) {
      return NextResponse.json(
        { data: null, error: "Horticulturist notes is required" },
        { status: 400 }
      );
    }

    // Image is required
    if (!imageFile) {
      return NextResponse.json(
        { data: null, error: "Image is required" },
        { status: 400 }
      );
    }

    // Validate image type and size
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { data: null, error: "Image must be JPG, PNG, or WebP" },
        { status: 400 }
      );
    }

    const maxSize = 8 * 1024 * 1024; // 8MB
    if (imageFile.size > maxSize) {
      return NextResponse.json(
        { data: null, error: "Image must be smaller than 8MB" },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminSupabaseClient();

    let imageStorageUrl: string | null = null;
    let thumbnailStorageUrl: string | null = null;

    // Handle image upload and thumbnail generation (imageFile is guaranteed to exist at this point)
    try {
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const plantId = crypto.randomUUID();
      const timestamp = Date.now();

      // Generate paths
      const imagePath = `plants/${plantId}/image_${timestamp}.jpg`;
      const thumbnailPath = `plants/${plantId}/thumbnail_${timestamp}.jpg`;

      // Dynamically import sharp only when needed (POST handler)
      const sharp = (await import("sharp")).default;

      // Process original image (convert to JPEG, optimize)
      const processedImage = await sharp(buffer)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Generate thumbnail (400px width, maintain aspect ratio)
      const thumbnail = await sharp(buffer)
        .resize(400, 400, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Upload original image
      const { error: imageUploadError } = await adminSupabase.storage
        .from("plant-images")
        .upload(imagePath, processedImage, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (imageUploadError) {
        throw new Error(`Failed to upload image: ${imageUploadError.message}`);
      }

      // Upload thumbnail
      const { error: thumbnailUploadError } = await adminSupabase.storage
        .from("plant-images")
        .upload(thumbnailPath, thumbnail, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (thumbnailUploadError) {
        throw new Error(`Failed to upload thumbnail: ${thumbnailUploadError.message}`);
      }

      // Get public URLs
      const { data: imageUrlData } = adminSupabase.storage
        .from("plant-images")
        .getPublicUrl(imagePath);

      const { data: thumbnailUrlData } = adminSupabase.storage
        .from("plant-images")
        .getPublicUrl(thumbnailPath);

      imageStorageUrl = imageUrlData.publicUrl;
      thumbnailStorageUrl = thumbnailUrlData.publicUrl;
    } catch (imageError) {
      console.error("Image upload error:", imageError);
      return NextResponse.json(
        { data: null, error: `Image upload failed: ${imageError instanceof Error ? imageError.message : "Unknown error"}` },
        { status: 500 }
      );
    }

    // Insert plant record (all fields are validated and non-empty at this point)
    const { data: plantData, error: insertError } = await adminSupabase
      .from("plants")
      .insert({
        name,
        scientific_name,
        category, // Store as text (backward compatibility)
        light, // Store as text (backward compatibility)
        watering_requirement,
        fertilization_requirement,
        soil_mix,
        toxicity,
        lifespan,
        horticulturist_notes,
        can_be_procured,
        image_storage_url: imageStorageUrl,
        thumbnail_storage_url: thumbnailStorageUrl,
        airtable_id: crypto.randomUUID(), // Generate unique ID
        sync_status: "manual",
        last_synced_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { data: null, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: plantData, error: null }, { status: 201 });
  } catch (err) {
    console.error("POST /api/internal/plants failed", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
