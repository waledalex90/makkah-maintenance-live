import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SecurityEventPayload = {
  event_type: string;
  status_code?: number | null;
  message: string;
  actor_user_id?: string | null;
  actor_email?: string | null;
  actor_company_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function recordSecurityEvent(payload: SecurityEventPayload): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("security_events").insert({
      event_type: payload.event_type,
      status_code: payload.status_code ?? null,
      message: payload.message,
      actor_user_id: payload.actor_user_id ?? null,
      actor_email: payload.actor_email ?? null,
      actor_company_id: payload.actor_company_id ?? null,
      metadata: payload.metadata ?? {},
    });
  } catch (error) {
    console.error("[security-events] failed to record", error);
  }
}

