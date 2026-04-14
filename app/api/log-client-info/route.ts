import { NextResponse } from "next/server";
import { recordSecurityEvent } from "@/lib/security-events";

type InfoPayload = {
  message?: unknown;
  details?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InfoPayload;
    console.log("[ClientInfo]", body?.message ?? "No message", body?.details);
    const messageText = String(body?.message ?? "").toLowerCase();
    const detailsText = JSON.stringify(body?.details ?? {}).toLowerCase();
    if (messageText.includes("403") || detailsText.includes("403") || messageText.includes("tenant guard") || detailsText.includes("tenant guard")) {
      await recordSecurityEvent({
        event_type: "client_403_info",
        status_code: 403,
        message: String(body?.message ?? "Client 403 info"),
        metadata: { details: body?.details ?? null, source: "client-info-route" },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ClientInfo] Failed to parse payload", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
