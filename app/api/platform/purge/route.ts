import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { recordSecurityEvent } from "@/lib/security-events";
import { PLATFORM_PURGE_CONFIRMATION_PHRASE } from "@/lib/platform-purge";

export async function POST(request: Request) {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { confirmationPhrase?: string; databaseOnly?: boolean };
  try {
    body = (await request.json()) as { confirmationPhrase?: string; databaseOnly?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const databaseOnly = body.databaseOnly === true;

  if (body.confirmationPhrase !== PLATFORM_PURGE_CONFIRMATION_PHRASE) {
    await recordSecurityEvent({
      event_type: "platform_purge_denied",
      status_code: 400,
      message: "Confirmation phrase mismatch or missing.",
      actor_user_id: user.id,
      actor_email: user.email,
    });
    return NextResponse.json({ error: "phrase_mismatch" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: rpcData, error: rpcError } = await admin.rpc("platform_purge_tenant_data", {
    p_actor: user.id,
  });

  if (rpcError) {
    await recordSecurityEvent({
      event_type: "platform_purge_failed",
      status_code: 500,
      message: rpcError.message,
      actor_user_id: user.id,
      actor_email: user.email,
      metadata: { code: rpcError.code },
    });
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  const deleteErrors: string[] = [];
  if (!databaseOnly) {
    let page = 1;
    const perPage = 200;
    for (;;) {
      const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
      if (listErr) {
        deleteErrors.push(listErr.message);
        break;
      }
      const batch = listData?.users ?? [];
      for (const u of batch) {
        if (u.id === user.id) continue;
        const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
        if (delErr) deleteErrors.push(`${u.id}: ${delErr.message}`);
      }
      if (batch.length < perPage) break;
      page += 1;
    }
  }

  await recordSecurityEvent({
    event_type: "platform_purge_completed",
    status_code: 200,
    message: databaseOnly
      ? "Platform purge completed (database only; auth users kept)."
      : "Platform purge completed (DB + auth users except actor).",
    actor_user_id: user.id,
    actor_email: user.email,
    metadata: {
      database_only: databaseOnly,
      rpc: rpcData,
      auth_delete_errors: databaseOnly ? null : deleteErrors.length ? deleteErrors : null,
    },
  });

  return NextResponse.json({
    ok: true,
    result: rpcData,
    database_only: databaseOnly,
    auth_delete_errors: databaseOnly ? undefined : deleteErrors.length ? deleteErrors : undefined,
  });
}
