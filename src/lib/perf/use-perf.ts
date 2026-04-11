"use client";

import { useRef, useCallback } from "react";

type PerfBeacon = {
  route: string;
  method: string;
  status_code: number;
  total_user_ms: number;
  ttfb_ms: number | null;
  transfer_ms: number | null;
  render_ms: number | null;
  page: string;
  metadata: Record<string, unknown> | null;
};

function sendBeacon(data: PerfBeacon) {
  try {
    fetch("/api/ops/perf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // silent
  }
}

function getResourceTiming(url: string): { ttfb: number | null; transfer: number | null } {
  try {
    const entries = performance.getEntriesByName(url, "resource") as PerformanceResourceTiming[];
    if (entries.length === 0) return { ttfb: null, transfer: null };
    const entry = entries[entries.length - 1]; // most recent
    const ttfb = entry.responseStart > 0 ? entry.responseStart - entry.requestStart : null;
    const transfer = entry.responseEnd > 0 && entry.responseStart > 0
      ? entry.responseEnd - entry.responseStart
      : null;
    return { ttfb, transfer };
  } catch {
    return { ttfb: null, transfer: null };
  }
}

function getConnectionType(): string | null {
  try {
    const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
    return nav.connection?.effectiveType ?? null;
  } catch {
    return null;
  }
}

/**
 * usePerf — wraps a SWR fetcher to measure user-facing latency.
 * Returns a wrapped fetcher that beacons timing data on initial load only.
 *
 * Usage with SWR:
 *   const perfFetcher = usePerf('/api/ops/customers', '/ops/customers');
 *   const { data } = useSWR(url, perfFetcher);
 */
export function usePerf(route: string, page: string) {
  const hasBeaconed = useRef(false);
  const mountTime = useRef(Date.now());

  // Reset mount time on each call so SWR key changes are tracked
  mountTime.current = Date.now();

  const perfFetcher = useCallback(
    async (url: string) => {
      const fetchStart = Date.now();
      const res = await fetch(url);
      const dataReceiveTime = Date.now();

      const json = await res.json();

      // Only beacon on initial load, not background revalidations
      if (!hasBeaconed.current) {
        hasBeaconed.current = true;

        // Wait for next paint to measure render time
        requestAnimationFrame(() => {
          const renderDone = Date.now();
          const timing = getResourceTiming(url);
          const totalUserMs = renderDone - mountTime.current;
          const renderMs = renderDone - dataReceiveTime;

          sendBeacon({
            route,
            method: "GET",
            status_code: res.status,
            total_user_ms: totalUserMs,
            ttfb_ms: timing.ttfb,
            transfer_ms: timing.transfer,
            render_ms: renderMs,
            page,
            metadata: {
              connection: getConnectionType(),
            },
          });
        });
      }

      return json;
    },
    [route, page]
  );

  return perfFetcher;
}

/**
 * trackFetch — wraps a raw fetch() call with timing for non-SWR pages.
 * Beacons once per call.
 *
 * Usage:
 *   const data = await trackFetch('/api/internal/customers?q=test', '/internal/customers', fetchFn);
 */
export async function trackFetch<T>(
  url: string,
  page: string,
  fetchFn: () => Promise<{ response: Response; data: T }>
): Promise<T> {
  const fetchStart = Date.now();
  const { response, data } = await fetchFn();
  const dataReceiveTime = Date.now();

  // Measure render in next frame
  requestAnimationFrame(() => {
    const renderDone = Date.now();
    const timing = getResourceTiming(url);
    const totalUserMs = renderDone - fetchStart;
    const renderMs = renderDone - dataReceiveTime;

    sendBeacon({
      route: new URL(url, window.location.origin).pathname,
      method: "GET",
      status_code: response.status,
      total_user_ms: totalUserMs,
      ttfb_ms: timing.ttfb,
      transfer_ms: timing.transfer,
      render_ms: renderMs,
      page,
      metadata: {
        connection: getConnectionType(),
      },
    });
  });

  return data;
}
