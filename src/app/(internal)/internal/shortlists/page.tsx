"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Helper to safely read JSON from response
async function safeReadJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!res.ok) {
    if (contentType.includes("application/json")) {
      try {
        return { ok: false, body: JSON.parse(text) };
      } catch {}
    }
    return { ok: false, body: { error: text?.slice(0, 300) || `Request failed (${res.status})` } };
  }
  if (!text) return { ok: true, body: null };
  if (contentType.includes("application/json")) {
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return { ok: false, body: { error: "Invalid JSON returned from server" } };
    }
  }
  return { ok: false, body: { error: "Server returned non-JSON response" } };
}

interface Shortlist {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  customer_id: string;
  customer_name: string;
  created_at: string;
  updated_at: string;
  current_version_number?: number;
  latest_sent_version_number?: number;
  latest_sent_at?: string | null;
  public_url?: string | null;
  has_public_link?: boolean;
  has_unsent_changes?: boolean;
}

export default function ShortlistsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [shortlists, setShortlists] = useState<Shortlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [copyingLinkId, setCopyingLinkId] = useState<string | null>(null);

  // Fetch shortlists
  useEffect(() => {
    const fetchShortlists = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/internal/shortlists");
        const result = await safeReadJson(response);

        if (!result.ok || result.body?.error) {
          throw new Error(result.body?.error || "Failed to fetch shortlists");
        }

        setShortlists(result.body?.data || []);
      } catch (err) {
        console.error("Error fetching shortlists:", err);
        setError(err instanceof Error ? err.message : "Failed to load shortlists");
      } finally {
        setLoading(false);
      }
    };

    fetchShortlists();
  }, []);

  // Check for publish success query param
  useEffect(() => {
    if (searchParams.get("published") === "1") {
      setPublishSuccess(true);
      // Clear query param
      router.replace("/internal/shortlists");
      // Auto-dismiss after 3 seconds
      setTimeout(() => setPublishSuccess(false), 3000);
    }
  }, [searchParams, router]);

  // Handle delete (only for DRAFT shortlists)
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this shortlist? This action cannot be undone.")) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await fetch(`/api/internal/shortlists/${id}`, {
        method: "DELETE",
      });

      const result = await safeReadJson(response);

      if (!result.ok || result.body?.error) {
        throw new Error(result.body?.error || "Failed to delete shortlist");
      }

      // Update local state
      setShortlists((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Error deleting shortlist:", err);
      alert(err instanceof Error ? err.message : "Failed to delete shortlist");
    } finally {
      setDeletingId(null);
    }
  };

  // Handle copy link
  const handleCopyLink = async (id: string) => {
    try {
      setCopyingLinkId(id);
      const response = await fetch(`/api/internal/shortlists/${id}/link`);
      const result = await safeReadJson(response);

      if (!result.ok || result.body?.error) {
        throw new Error(result.body?.error || "Failed to get link");
      }

      const publicUrl = result.body?.data?.publicUrl;
      if (publicUrl) {
        await navigator.clipboard.writeText(publicUrl);
        alert("Link copied to clipboard!");
      }
    } catch (err) {
      console.error("Error copying link:", err);
      alert(err instanceof Error ? err.message : "Failed to copy link");
    } finally {
      setCopyingLinkId(null);
    }
  };

  // Handle duplicate
  const handleDuplicate = async (id: string) => {
    try {
      const response = await fetch(`/api/internal/shortlists/${id}/duplicate`, {
        method: "POST",
      });

      const result = await safeReadJson(response);

      if (!result.ok || result.body?.error) {
        throw new Error(result.body?.error || "Failed to duplicate shortlist");
      }

      // Refresh list
      const refreshResponse = await fetch("/api/internal/shortlists");
      const refreshResult = await safeReadJson(refreshResponse);
      if (refreshResult.ok && refreshResult.body?.data) {
        setShortlists(refreshResult.body.data);
      }
    } catch (err) {
      console.error("Error duplicating shortlist:", err);
      alert(err instanceof Error ? err.message : "Failed to duplicate shortlist");
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get status badge styling
  const getStatusBadge = (status: string, hasUnsentChanges?: boolean) => {
    const upperStatus = status.toUpperCase();
    let badge;
    switch (upperStatus) {
      case "DRAFT":
        badge = (
          <span className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full">
            Draft
          </span>
        );
        break;
      case "SENT_TO_CUSTOMER":
        badge = (
          <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
            Sent to Customer
          </span>
        );
        break;
      case "CUSTOMER_SUBMITTED":
        badge = (
          <span className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full">
            Customer Submitted
          </span>
        );
        break;
      case "SENT_BACK_TO_CUSTOMER":
        badge = (
          <span className="px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full">
            Sent Back to Customer
          </span>
        );
        break;
      case "TO_BE_PROCURED":
        badge = (
          <span className="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-full">
            To Be Procured
          </span>
        );
        break;
      default:
        badge = (
          <span className="px-2 py-1 text-xs font-medium text-gray-500 bg-gray-50 rounded-full">
            {status}
          </span>
        );
    }

    // Add unsent changes indicator
    if (upperStatus === "SENT_TO_CUSTOMER" && hasUnsentChanges) {
      return (
        <div className="flex items-center gap-2">
          {badge}
          <span className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full">
            Updated (not sent)
          </span>
        </div>
      );
    }

    return badge;
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Loading shortlists...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shortlists</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Shortlists</h1>
        <p className="text-sm text-gray-600 mt-1">Manage plant shortlists for customers</p>
      </div>

      {/* Publish Success Banner */}
      {publishSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">✓ Shortlist published successfully!</p>
        </div>
      )}

      {/* Empty state */}
      {shortlists.length === 0 && (
        <div className="bg-white p-8 rounded-lg border border-gray-200 text-center">
          <p className="text-gray-500">No shortlists yet. Create one from a customer profile.</p>
        </div>
      )}

      {/* Table */}
      {shortlists.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Shortlist Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {shortlists.map((shortlist) => {
                  const upperStatus = shortlist.status.toUpperCase();
                  const isDraft = upperStatus === "DRAFT";
                  const isNonDraft = !isDraft;

                  return (
                    <tr key={shortlist.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {shortlist.title}
                        </div>
                        {shortlist.description && (
                          <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                            {shortlist.description}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{shortlist.customer_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(shortlist.status, shortlist.has_unsent_changes)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {isDraft ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span>v{shortlist.latest_sent_version_number || 0}</span>
                              {shortlist.has_unsent_changes && (
                                <>
                                  <span className="text-gray-400">·</span>
                                  <span className="text-amber-600">Updated</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(shortlist.updated_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isDraft && (
                            <>
                              <button
                                onClick={() => router.push(`/internal/shortlists/${shortlist.id}`)}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                Resume
                              </button>
                              <span className="text-gray-300">|</span>
                              <button
                                onClick={() => handleDelete(shortlist.id)}
                                disabled={deletingId === shortlist.id}
                                className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                              >
                                {deletingId === shortlist.id ? "Deleting..." : "Delete"}
                              </button>
                            </>
                          )}
                          {isNonDraft && (
                            <>
                              <button
                                onClick={() => router.push(`/internal/shortlists/${shortlist.id}`)}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                View
                              </button>
                              <span className="text-gray-300">|</span>
                              <button
                                onClick={() => handleDuplicate(shortlist.id)}
                                className="text-sm text-gray-600 hover:text-gray-800"
                              >
                                Duplicate
                              </button>
                              <span className="text-gray-300">|</span>
                              <button
                                onClick={() => handleCopyLink(shortlist.id)}
                                disabled={copyingLinkId === shortlist.id}
                                className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
                              >
                                {copyingLinkId === shortlist.id ? "Copying..." : "Copy link"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-gray-200">
            {shortlists.map((shortlist) => {
              const upperStatus = shortlist.status.toUpperCase();
              const isDraft = upperStatus === "DRAFT";
              const isNonDraft = !isDraft;

              return (
                <div key={shortlist.id} className="p-4 space-y-3">
                  <div>
                    <h3 className="text-base font-medium text-gray-900">{shortlist.title}</h3>
                    {shortlist.description && (
                      <p className="text-sm text-gray-600 mt-1">{shortlist.description}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Customer:</span>
                    <span className="text-gray-900">{shortlist.customer_name}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Status:</span>
                    {getStatusBadge(shortlist.status, shortlist.has_unsent_changes)}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Version:</span>
                    <span className="text-gray-900">
                      {shortlist.status.toUpperCase() === "DRAFT" ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span>v{shortlist.latest_sent_version_number || 0}</span>
                          {shortlist.has_unsent_changes && (
                            <>
                              <span className="text-gray-400">·</span>
                              <span className="text-amber-600">Updated</span>
                            </>
                          )}
                        </div>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Updated:</span>
                    <span className="text-gray-900">{formatDate(shortlist.updated_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                    {isDraft && (
                      <>
                        <button
                          onClick={() => router.push(`/internal/shortlists/${shortlist.id}`)}
                          className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                        >
                          Resume
                        </button>
                        <button
                          onClick={() => handleDelete(shortlist.id)}
                          disabled={deletingId === shortlist.id}
                          className="flex-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 disabled:opacity-50"
                        >
                          {deletingId === shortlist.id ? "Deleting..." : "Delete"}
                        </button>
                      </>
                    )}
                    {isNonDraft && (
                      <>
                        <button
                          onClick={() => router.push(`/internal/shortlists/${shortlist.id}`)}
                          className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDuplicate(shortlist.id)}
                          className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => handleCopyLink(shortlist.id)}
                          disabled={copyingLinkId === shortlist.id}
                          className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100 disabled:opacity-50"
                        >
                          {copyingLinkId === shortlist.id ? "Copying..." : "Copy link"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
