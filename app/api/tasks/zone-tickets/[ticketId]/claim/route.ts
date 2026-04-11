import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatSaudiTime } from "@/lib/saudi-time";
import { ticketCategoryNameMatchesSpecialty } from "@/lib/specialty-category-match";
import { taskDocMessagePrefixClaimTicket } from "@/lib/ticket-task-doc-message";

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
    .select("role, full_name, specialty, region")
    .eq("id", user.id)
    .single();
  if (meError || !me || me.role !== "technician") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticketId } = await context.params;

  try {
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id, zone_id, status, assigned_technician_id, category_id, zones(name)")
      .eq("id", ticketId)
      .single();
    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const { data: zoneLink, error: zoneLinkError } = await supabase
      .from("zone_profiles")
      .select("zone_id")
      .eq("profile_id", user.id)
      .eq("zone_id", ticket.zone_id)
      .maybeSingle();
    if (zoneLinkError || !zoneLink) {
      return NextResponse.json({ error: "Ticket is outside your zone." }, { status: 403 });
    }

    const zoneRow = ticket.zones as { name?: string } | { name?: string }[] | null | undefined;
    const zoneName = Array.isArray(zoneRow) ? zoneRow[0]?.name : zoneRow?.name;
    if (me.region && zoneName && me.region !== zoneName) {
      return NextResponse.json({ error: "Ticket region does not match your profile region." }, { status: 403 });
    }

    const spec = me.specialty as string | null;
    if (spec) {
      if (!ticket.category_id) {
        return NextResponse.json({ error: "Ticket has no category." }, { status: 403 });
      }
      const { data: categoryRow } = await supabase
        .from("ticket_categories")
        .select("name")
        .eq("id", ticket.category_id)
        .maybeSingle();

      const categoryName = categoryRow?.name ?? "";
      if (!categoryName.trim()) {
        return NextResponse.json({ error: "Ticket category could not be resolved." }, { status: 400 });
      }
      if (!ticketCategoryNameMatchesSpecialty(categoryName, spec)) {
        return NextResponse.json({ error: "Ticket category does not match your specialty." }, { status: 403 });
      }
    }

    const nextStatus = ticket.status === "not_received" ? "received" : ticket.status;
    const { error: updateError } = await supabase
      .from("tickets")
      .update({ assigned_technician_id: user.id, status: nextStatus })
      .eq("id", ticketId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const stablePrefix = taskDocMessagePrefixClaimTicket(me.full_name ?? "");
    const { data: existingDoc } = await supabase
      .from("ticket_messages")
      .select("id")
      .eq("ticket_id", ticketId)
      .eq("sender_id", user.id)
      .like("content", `${stablePrefix}%`)
      .limit(1)
      .maybeSingle();

    if (!existingDoc) {
      const nowLabel = formatSaudiTime(Date.now());
      await supabase.from("ticket_messages").insert({
        ticket_id: ticketId,
        sender_id: user.id,
        content: `${stablePrefix} - الساعة ${nowLabel}.`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
