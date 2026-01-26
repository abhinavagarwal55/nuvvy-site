import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { getInternalAccess } from "@/lib/internal/authz";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// Force Node.js runtime for this route
export const runtime = "nodejs";

// Helper function to check auth
async function checkAuth(): Promise<{ authorized: boolean; error?: string; status?: number }> {
  const isDevBypass =
    (process.env.INTERNAL_AUTH_BYPASS === "true" ||
      process.env.INTERNAL_AUTH_BYPASS === "1") &&
    process.env.NODE_ENV !== "production";

  if (isDevBypass) {
    return { authorized: true };
  }

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await checkAuth();
    if (!authCheck.authorized) {
      return NextResponse.json(
        { data: null, error: authCheck.error },
        { status: authCheck.status || 401 }
      );
    }

    const { id } = await params;
    const adminSupabase = createAdminSupabaseClient();

    // Try to find by id first (UUID), then by airtable_id
    let { data: plant, error } = await adminSupabase
      .from("plants")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !plant) {
      // Try airtable_id as fallback
      const { data: plantByAirtableId, error: error2 } = await adminSupabase
        .from("plants")
        .select("*")
        .eq("airtable_id", id)
        .single();

      if (error2 || !plantByAirtableId) {
        return NextResponse.json(
          { data: null, error: "Plant not found" },
          { status: 404 }
        );
      }

      plant = plantByAirtableId;
    }

    return NextResponse.json({ data: plant, error: null }, { status: 200 });
  } catch (err) {
    console.error("GET /api/internal/plants/[id] failed", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await checkAuth();
    if (!authCheck.authorized) {
      return NextResponse.json(
        { data: null, error: authCheck.error },
        { status: authCheck.status || 401 }
      );
    }

    const { id } = await params;
    const adminSupabase = createAdminSupabaseClient();

    // First, verify plant exists
    let { data: existingPlant, error: fetchError } = await adminSupabase
      .from("plants")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existingPlant) {
      // Try airtable_id as fallback
      const { data: plantByAirtableId, error: error2 } = await adminSupabase
        .from("plants")
        .select("*")
        .eq("airtable_id", id)
        .single();

      if (error2 || !plantByAirtableId) {
        return NextResponse.json(
          { data: null, error: "Plant not found" },
          { status: 404 }
        );
      }

      existingPlant = plantByAirtableId;
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
    const price_bandRaw = formData.get("price_band") as string | null;
    const can_be_procured_str = formData.get("can_be_procured") as string | null;
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
    const price_band = price_bandRaw?.trim() || "";

    if (!name) {
      return NextResponse.json(
        { data: null, error: "Name is required" },
        { status: 400 }
      );
    }
    if (!scientific_name) {
      return NextResponse.json(
        { data: null, error: "Scientific Name is required" },
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
        { data: null, error: "Watering Requirement is required" },
        { status: 400 }
      );
    }
    if (!fertilization_requirement) {
      return NextResponse.json(
        { data: null, error: "Fertilization Requirement is required" },
        { status: 400 }
      );
    }
    if (!soil_mix) {
      return NextResponse.json(
        { data: null, error: "Soil Mix is required" },
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
        { data: null, error: "Horticulturist Notes are required" },
        { status: 400 }
      );
    }
    if (!price_band) {
      return NextResponse.json(
        { data: null, error: "Price band is required" },
        { status: 400 }
      );
    }

    // Validate can_be_procured
    let can_be_procured: boolean;
    if (can_be_procured_str === "true") {
      can_be_procured = true;
    } else if (can_be_procured_str === "false") {
      can_be_procured = false;
    } else {
      return NextResponse.json(
        { data: null, error: "Can be procured? is required" },
        { status: 400 }
      );
    }

    // Image is optional for updates - validate only if provided
    if (imageFile) {
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
    }

    let imageStorageUrl: string | null = existingPlant.image_storage_url || null;
    let thumbnailStorageUrl: string | null = existingPlant.thumbnail_storage_url || null;

    // Handle image upload only if new image is provided (upload original as-is, no processing)
    // TODO: Add async thumbnail generation via background job
    if (imageFile) {
      try {
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const plantId = existingPlant.id;
        const timestamp = Date.now();

        // Determine file extension from original file
        const originalName = imageFile.name || "image";
        const fileExtension = originalName.split(".").pop()?.toLowerCase() || "jpg";
        const sanitizedExtension = ["jpg", "jpeg", "png", "webp"].includes(fileExtension) ? fileExtension : "jpg";

        // Generate single path for the uploaded image
        const imagePath = `plants/${plantId}/image_${timestamp}.${sanitizedExtension}`;

        // Upload original image as-is (no resizing or transformation)
        const { error: imageUploadError } = await adminSupabase.storage
          .from("plant-images")
          .upload(imagePath, buffer, {
            contentType: imageFile.type,
            upsert: false,
          });

        if (imageUploadError) {
          throw new Error(`Failed to upload image: ${imageUploadError.message}`);
        }

        // Get public URL
        const { data: imageUrlData } = adminSupabase.storage
          .from("plant-images")
          .getPublicUrl(imagePath);

        // Set both image_storage_url and thumbnail_storage_url to the same URL
        // UI will handle CSS scaling for thumbnails
        imageStorageUrl = imageUrlData.publicUrl;
        thumbnailStorageUrl = imageUrlData.publicUrl;
      } catch (imageError) {
        console.error("Image upload error:", imageError);
        return NextResponse.json(
          {
            data: null,
            error: `Image upload failed: ${imageError instanceof Error ? imageError.message : "Unknown error"}`,
          },
          { status: 500 }
        );
      }
    }

    // Update plant record
    const updateData: any = {
      name,
      scientific_name,
      category,
      light,
      watering_requirement,
      fertilization_requirement,
      soil_mix,
      toxicity,
      lifespan,
      horticulturist_notes,
      can_be_procured,
      price_band,
      updated_at: new Date().toISOString(),
    };

    // Only update image URLs if a new image was uploaded
    if (imageFile) {
      updateData.image_storage_url = imageStorageUrl;
      updateData.thumbnail_storage_url = thumbnailStorageUrl;
    }

    const { data: plantData, error: updateError } = await adminSupabase
      .from("plants")
      .update(updateData)
      .eq("id", existingPlant.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { data: null, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: plantData, error: null }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/internal/plants/[id] failed", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}

// Support PUT as alias for PATCH
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PATCH(request, { params });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await checkAuth();
    if (!authCheck.authorized) {
      return NextResponse.json(
        { data: null, error: authCheck.error },
        { status: authCheck.status || 401 }
      );
    }

    const { id } = await params;
    const adminSupabase = createAdminSupabaseClient();

    // Try to delete by id first (UUID), then by airtable_id
    let { data: deletedPlant, error: deleteError } = await adminSupabase
      .from("plants")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (deleteError || !deletedPlant) {
      // Try airtable_id as fallback
      const { data: deletedByAirtableId, error: error2 } = await adminSupabase
        .from("plants")
        .delete()
        .eq("airtable_id", id)
        .select()
        .single();

      if (error2 || !deletedByAirtableId) {
        return NextResponse.json(
          { data: null, error: "Plant not found" },
          { status: 404 }
        );
      }

      deletedPlant = deletedByAirtableId;
    }

    return NextResponse.json({ ok: true, data: deletedPlant }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/internal/plants/[id] failed", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
