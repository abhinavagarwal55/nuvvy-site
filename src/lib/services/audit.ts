import { getSupabaseAdmin } from "@/lib/supabase/server";

export interface AuditEventInput {
  actorId: string;
  actorRole: string;
  action: string; // e.g. 'bill.marked_paid', 'customer.deactivated'
  targetTable: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Log an audit event. Fire-and-forget — errors are swallowed to avoid
 * breaking the main operation. No UI in V1.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("audit_logs").insert({
      actor_id: input.actorId,
      actor_role: input.actorRole,
      action: input.action,
      target_table: input.targetTable,
      target_id: input.targetId,
      metadata: input.metadata ?? null,
      ip_address: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    });
  } catch {
    // Swallow — audit logging must never break the main operation
  }
}
