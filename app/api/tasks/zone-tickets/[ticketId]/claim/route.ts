import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PATCH(_request: Request, context: { params: Promise<{ ticketId: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me, error: meError } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (meError || !me || me.role !== "technician") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticketId } = await context.params;

  try {
    const admin = createSupabaseAdminClient();

    const { data: ticket, error: ticketError } = await admin
      .from("tickets")
      .select("id, zone_id, status, assigned_technician_id")
      .eq("id", ticketId)
      .single();
    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const { data: zoneLink } = await admin
      .from("zone_profiles")
      .select("zone_id")
      .eq("profile_id", user.id)
      .eq("zone_id", ticket.zone_id)
      .maybeSingle();
    if (!zoneLink) {
      return NextResponse.json({ error: "Ticket is outside your zone." }, { status: 403 });
    }

    if (ticket.assigned_technician_id && ticket.assigned_technician_id !== user.id) {
      return NextResponse.json({ error: "Ticket already assigned to another technician." }, { status: 409 });
    }

    const nextStatus = ticket.status === "new" ? "assigned" : ticket.status;
    const { error: updateError } = await admin
      .from("tickets")
      .update({ assigned_technician_id: user.id, status: nextStatus })
      .eq("id", ticketId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const nowLabel = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    await admin.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content: `تكليفات: ${me.full_name} قبل البلاغ وبدأ التنفيذ - الساعة ${nowLabel}.`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
