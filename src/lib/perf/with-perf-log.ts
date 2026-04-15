import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { PerfContext } from "./perf-context";

type RouteHandler = (
  request: NextRequest,
  ctx: PerfContext,
  routeParams?: unknown
) => Promise<Response>;

/**
 * withPerfLog — higher-order function that wraps a Next.js API route handler
 * with automatic performance logging to the perf_logs table.
 *
 * - Creates a PerfContext for timing sub-operations
 * - Catches thrown Responses (requireOpsAuth pattern)
 * - Fire-and-forget insert into perf_logs (never awaited, never throws)
 * - Skips logging for /api/ops/perf and /api/ops/metrics (avoid infinite loops)
 */
export function withPerfLog(routeName: string, handler: RouteHandler) {
  // Skip instrumentation for perf/metrics routes
  const shouldSkip =
    routeName.includes("/api/ops/perf") ||
    routeName.includes("/api/ops/metrics");

  return async function wrappedHandler(
    request: NextRequest,
    routeParams?: unknown
  ): Promise<Response> {
    if (shouldSkip) {
      const ctx = new PerfContext();
      return handler(request, ctx, routeParams);
    }

    const ctx = new PerfContext();

    // Read middleware auth timing (set by middleware via x-mw-auth-ms header)
    const mwAuthHeader = request.headers.get("x-mw-auth-ms");
    if (mwAuthHeader) {
      const mwAuthMs = parseInt(mwAuthHeader, 10);
      if (!isNaN(mwAuthMs)) ctx.setMiddlewareAuthMs(mwAuthMs);
    }

    const start = Date.now();
    let response: Response;
    let statusCode = 200;

    try {
      response = await handler(request, ctx, routeParams);
      statusCode = response.status;
    } catch (thrown: unknown) {
      // requireOpsAuth throws Response objects for 401/403
      if (thrown instanceof Response) {
        response = thrown;
        statusCode = thrown.status;
      } else {
        // Unexpected error — log and rethrow
        statusCode = 500;
        response = NextResponse.json(
          { error: "Internal Server Error" },
          { status: 500 }
        );
      }
    }

    const totalMs = Date.now() - start;

    // Fire-and-forget insert — never awaited, never throws
    Promise.resolve()
      .then(() => {
        const supabase = getSupabaseAdmin();
        return supabase.from("perf_logs").insert({
          source: "server",
          route: routeName,
          method: request.method,
          status_code: statusCode,
          total_ms: totalMs,
          auth_ms: ctx.getTotalAuthMs() || null,
          query_ms: ctx.getQueryMs() || null,
          query_count: ctx.getQueryCount() || null,
          user_id: ctx.getUserId(),
          role: ctx.getRole(),
          metadata: {
            ...(Object.keys(ctx.getMeta()).length > 0 ? ctx.getMeta() : {}),
            ...(ctx.getMiddlewareAuthMs() > 0
              ? {
                  middleware_auth_ms: ctx.getMiddlewareAuthMs(),
                  route_auth_ms: ctx.getAuthMs(),
                }
              : {}),
          },
        });
      })
      .catch((err) => {
        console.error("perf log failed:", err);
      });

    return response;
  };
}
