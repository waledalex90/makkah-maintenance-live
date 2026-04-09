import { NextResponse } from "next/server";

type InfoPayload = {
  message?: unknown;
  details?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InfoPayload;
    console.log("[ClientInfo]", body?.message ?? "No message", body?.details);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ClientInfo] Failed to parse payload", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
