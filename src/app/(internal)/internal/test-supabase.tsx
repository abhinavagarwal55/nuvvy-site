"use client";

import { useState } from "react";

export default function TestSupabase() {
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    setResult("Testing...");

    try {
      const response = await fetch("/api/internal/plants?limit=1");
      const json = await response.json();

      if (!response.ok) {
        setResult(`Error (${response.status}): ${json.error || "Unknown error"}`);
      } else {
        setResult(`Success: ${JSON.stringify(json, null, 2)}`);
      }
    } catch (err) {
      setResult(`Exception: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 border border-gray-300 rounded">
      <button
        onClick={handleTest}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Testing..." : "Test Supabase Connection"}
      </button>
      {result && (
        <pre className="mt-4 p-2 bg-gray-100 rounded text-sm overflow-auto">
          {result}
        </pre>
      )}
    </div>
  );
}
