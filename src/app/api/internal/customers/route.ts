import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Force dynamic behavior
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Create Supabase client with service role
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/internal/customers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const status = searchParams.get("status") || "all";
    
    const supabase = getSupabaseAdmin();
    
    // Build query
    let query = supabase
      .from("customers")
      .select("*", { count: "exact" });
    
    // Apply search filter (name or phone number)
    if (q) {
      query = query.or(`name.ilike.%${q}%,phone_number.ilike.%${q}%`);
    }
    
    // Apply status filter
    if (status === "active") {
      query = query.eq("status", "ACTIVE");
    } else if (status === "inactive") {
      query = query.eq("status", "INACTIVE");
    }
    
    // Order by updated_at desc
    query = query.order("updated_at", { ascending: false });
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
    
    return NextResponse.json(
      { customers: data || [], totalCount: count || 0 },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    console.error("Error in GET /api/internal/customers:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}

// POST /api/internal/customers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone_number, address, status } = body;
    
    // Validation
    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }
    
    if (!phone_number?.trim()) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }
    
    if (!address?.trim()) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }
    
    if (!status || !["ACTIVE", "INACTIVE"].includes(status)) {
      return NextResponse.json(
        { error: "Valid status is required" },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: name.trim(),
        phone_number: phone_number.trim(),
        address: address.trim(),
        status,
      })
      .select()
      .single();
    
    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("Error in POST /api/internal/customers:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
