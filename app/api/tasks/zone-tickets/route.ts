import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OPEN_STATUSES = ["not_received", "received"] as const;

const TICKET_SELECT =
  "id, ticket_number, external_ticket_number, location, description, status, created_at, assigned_technician_id, assigned_supervisor_id, assigned_engineer_id, zone_id, category_id, category, ticket_categories(name), zones(name)";

function isAssignedToUser(
  row: {
    assigned_technician_id: string | null;
    assigned_supervisor_id: string | null;
    assigned_engineer_id: string | null;
  },
  userId: string,
) {
  return (
    row.assigned_technician_id === userId ||
    row.assigned_supervisor_id === userId ||
    row.assigned_engineer_id === userId
  );
}

export async function GET() {
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
    .select("role")
    .eq("id", user.id)
    .single();

  if (meError || !me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const role = me.role as string;
  if (!["technician", "supervisor"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { data: myTickets, error: myErr } = await supabase
      .from("tickets")
      .select(TICKET_SELECT)
      .in("status", [...OPEN_STATUSES])
      .or(
        `assigned_technician_id.eq.${user.id},assigned_supervisor_id.eq.${user.id},assigned_engineer_id.eq.${user.id}`,
      )
      .order("created_at", { ascending: false });

    if (myErr) {
      return NextResponse.json({ error: myErr.message }, { status: 400 });
    }

    const { data: zoneLinks, error: zoneError } = await supabase
      .from("zone_profiles")
      .select("zone_id")
      .eq("profile_id", user.id);

    if (zoneError) {
      return NextResponse.json({ error: zoneError.message }, { status: 400 });
    }

    const zoneIds = (zoneLinks ?? []).map((row) => row.zone_id as string);
    if (zoneIds.length === 0) {
      return NextResponse.json({ areaTickets: [], myTickets: myTickets ?? [] });
    }

    const { data: zonePool, error: poolErr } = await supabase
      .from("tickets")
      .select(TICKET_SELECT)
      .in("zone_id", zoneIds)
      .in("status", [...OPEN_STATUSES])
      .order("created_at", { ascending: false });

    if (poolErr) {
      return NextResponse.json({ error: poolErr.message }, { status: 400 });
    }

    const areaTickets = (zonePool ?? []).filter((row) => !isAssignedToUser(row, user.id));

    return NextResponse.json({
      areaTickets,
      myTickets: myTickets ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
