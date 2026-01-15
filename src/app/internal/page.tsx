import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import TestSupabase from "./test-supabase";

export default async function InternalPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Internal Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Signed in as <span className="font-medium">{user?.email}</span>
        </p>
      </div>

      {/* Quick Links */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
        <Link
          href="/internal/plants"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          View Plants →
        </Link>
      </div>

      {/* Diagnostics */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Diagnostics</h2>
        <TestSupabase />
      </div>
    </div>
  );
}
