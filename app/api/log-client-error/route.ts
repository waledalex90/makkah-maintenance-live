import { NextResponse } from "next/server";
import { recordSecurityEvent } from "@/lib/security-events";

type LogPayload = {
  context?: unknown;
  details?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LogPayload;
    console.error("[ClientAuthError]", body?.context ?? "Unknown context", body?.details);
    const contextText = String(body?.context ?? "").toLowerCase();
    const detailsText = JSON.stringify(body?.details ?? {}).toLowerCase();
    if (contextText.includes("403") || detailsText.includes("403") || contextText.includes("tenant") || detailsText.includes("tenant")) {
      await recordSecurityEvent({
        event_type: "client_guard_reject",
        status_code: 403,
        message: String(body?.context ?? "Client guard reject"),
        metadata: { details: body?.details ?? null, source: "client-error-route" },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ClientAuthError] Failed to parse payload", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
