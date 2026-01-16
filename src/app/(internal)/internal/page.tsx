"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Stats {
  total: number;
  published: number;
  unpublished: number;
}

interface RecentPlant {
  id: string;
  name: string;
  updated_at: string;
}

export default function InternalPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentPlant[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    // Fetch stats
    fetch("/api/internal/plants/stats")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) {
          setStats(json.data);
        }
        setLoadingStats(false);
      })
      .catch(() => {
        setLoadingStats(false);
      });

    // Fetch recent plants
    fetch("/api/internal/plants/recent")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) {
          setRecent(json.data);
        }
        setLoadingRecent(false);
      })
      .catch(() => {
        setLoadingRecent(false);
      });
  }, []);

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "Unknown";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  const formatRelativeTime = (dateString: string | null | undefined): string => {
    if (!dateString) return "Unknown";
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
      return formatDate(dateString);
    } catch {
      return formatDate(dateString);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 px-4 md:px-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Internal Dashboard</h1>
        <p className="text-gray-600 mt-1">Manage plants and content</p>
      </div>

      {/* Quick Links */}
      <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
        <div className="flex flex-col gap-2 md:flex-row md:gap-3">
          <Link
            href="/internal/plants?modal=add"
            className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-center md:text-left"
          >
            Add Plant
          </Link>
          <Link
            href="/internal/plants"
            className="w-full md:w-auto px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors font-medium text-center md:text-left"
          >
            View Plants
          </Link>
        </div>
      </div>

      {/* Catalog Snapshot */}
      <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Catalog Snapshot</h2>
        {loadingStats ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600 mt-1">Total Plants</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-3xl font-bold text-gray-900">{stats.published}</div>
              <div className="text-sm text-gray-600 mt-1">Published Plants</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 col-span-2 md:col-span-1">
              <div className="text-3xl font-bold text-gray-900">{stats.unpublished}</div>
              <div className="text-sm text-gray-600 mt-1">Unpublished Plants</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Failed to load stats</div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        {loadingRecent ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : recent.length > 0 ? (
          <div className="space-y-3">
            {recent.map((plant) => (
              <div
                key={plant.id}
                className="flex flex-col gap-2 py-2 border-b border-gray-100 last:border-0 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 break-words line-clamp-2">{plant.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Updated {formatRelativeTime(plant.updated_at)}
                  </div>
                </div>
                <Link
                  href={`/internal/plants/${plant.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium flex-shrink-0 md:ml-4"
                >
                  View details →
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No recent activity</div>
        )}
      </div>
    </div>
  );
}
