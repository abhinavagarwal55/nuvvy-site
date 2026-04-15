/**
 * PerfContext — accumulates timing data for a single API request.
 * Passed into route handlers wrapped with withPerfLog.
 */
export class PerfContext {
  private middlewareAuthMs = 0;
  private authMs = 0;
  private queryMs = 0;
  private queryCount = 0;
  private userId: string | null = null;
  private role: string | null = null;
  private meta: Record<string, unknown> = {};

  /** Set middleware auth time (read from x-mw-auth-ms header) */
  setMiddlewareAuthMs(ms: number): void {
    this.middlewareAuthMs = ms;
  }

  /** Wrap an async operation and accumulate its time into auth_ms */
  async trackAuth<T>(fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.authMs += Date.now() - start;
    }
  }

  /** Wrap a Supabase query — accumulates into query_ms, increments query_count */
  async trackQuery<T>(fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.queryMs += Date.now() - start;
      this.queryCount++;
    }
  }

  /** Set the authenticated user (for logging) */
  setUser(userId: string, role: string): void {
    this.userId = userId;
    this.role = role;
  }

  /** Add arbitrary metadata */
  addMeta(key: string, value: unknown): void {
    this.meta[key] = value;
  }

  // ─── Getters ────────────────────────────────────────────────────────
  getMiddlewareAuthMs(): number { return this.middlewareAuthMs; }
  /** Total auth time: middleware refresh + route-handler auth */
  getTotalAuthMs(): number { return this.middlewareAuthMs + this.authMs; }
  getAuthMs(): number { return this.authMs; }
  getQueryMs(): number { return this.queryMs; }
  getQueryCount(): number { return this.queryCount; }
  getUserId(): string | null { return this.userId; }
  getRole(): string | null { return this.role; }
  getMeta(): Record<string, unknown> { return this.meta; }
}
