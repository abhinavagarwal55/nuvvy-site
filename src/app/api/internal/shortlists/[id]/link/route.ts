import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Create Supabase client with service role
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/internal/shortlists/[id]/link
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { data: null, error: "Shortlist ID is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Helper to get canonical public base URL (strips internal subdomains/paths)
    const getPublicBaseUrl = (): string => {
      // Priority 1: Use explicit NEXT_PUBLIC_BASE_URL if set
      if (process.env.NEXT_PUBLIC_BASE_URL) {
        let baseUrl = process.env.NEXT_PUBLIC_BASE_URL.trim();
        // Strip trailing slash
        if (baseUrl.endsWith("/")) {
          baseUrl = baseUrl.slice(0, -1);
        }
        // Guard: strip /internal path if present
        baseUrl = baseUrl.replace(/\/internal\/?$/, "");
        // Guard: strip internal. subdomain if present
        baseUrl = baseUrl.replace(/^https?:\/\/internal\./, (match) => match.replace("internal.", ""));
        return baseUrl;
      }

      // Priority 2: Derive from request headers
      const host = request.headers.get("host") || "localhost:3000";
      const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      
      // Guard: strip internal. subdomain
      let cleanHost = host.replace(/^internal\./, "");
      // Guard: strip /internal path (if host includes path)
      cleanHost = cleanHost.split("/")[0];
      
      const baseUrl = `${protocol}://${cleanHost}`;
      return baseUrl;
    };

    // Get or create stable public link
    const getOrCreateActiveLink = async (shortlistId: string): Promise<string | null> => {
      // Check for existing active link
      const { data: existingLink } = await supabase
        .from("shortlist_public_links")
        .select("id, token_hash")
        .eq("shortlist_id", shortlistId)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      // Generate deterministic token (same for same shortlist_id)
      const secret = process.env.SHORTLIST_LINK_SECRET || "default-secret-change-in-production";
      const token = createHash("sha256").update(`${shortlistId}-${secret}`).digest("hex").substring(0, 32);
      const tokenHash = createHash("sha256").update(token).digest("hex");

      const baseUrl = getPublicBaseUrl();

      if (existingLink) {
        // Link exists - return URL using deterministic token
        // /s/:token is the public customer-facing shortlist route
        return `${baseUrl}/s/${token}`;
      }

      // No link exists - create one with deterministic token
      const { data: publicLink, error: linkError } = await supabase
        .from("shortlist_public_links")
        .insert({
          shortlist_id: shortlistId,
          token_hash: tokenHash,
          active: true,
        })
        .select()
        .single();

      if (linkError) {
        console.error("Error creating public link:", linkError);
        return null;
      }

      // /s/:token is the public customer-facing shortlist route
      return `${baseUrl}/s/${token}`;
    };

    const publicUrl = await getOrCreateActiveLink(id);

    if (!publicUrl) {
      return NextResponse.json(
        { data: null, error: "Failed to get or create public link" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { publicUrl },
      error: null,
    });
  } catch (err) {
    console.error("Error in GET /api/internal/shortlists/[id]/link:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 }
    );
  }
}
