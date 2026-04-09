import { NextResponse } from "next/server";

type LogPayload = {
  context?: unknown;
  details?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LogPayload;
    console.error("[ClientAuthError]", body?.context ?? "Unknown context", body?.details);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ClientAuthError] Failed to parse payload", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
