import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id, assigned_technician_id, status")
      .eq("id", ticketId)
      .single();
    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }
    if (ticket.assigned_technician_id !== user.id) {
      return NextResponse.json({ error: "Ticket is not assigned to you." }, { status: 403 });
    }

    const { error: updateError } = await supabase.from("tickets").update({ status: "received" }).eq("id", ticketId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const nowLabel = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    await supabase.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content: `تكليفات: ${me.full_name} قبل المهمة وبدأ التنفيذ - الساعة ${nowLabel}.`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
