import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ticketCategoryNameMatchesSpecialty } from "@/lib/specialty-category-match";

/** كل الحالات عدا finished — يبقى البلاغ ظاهراً بعد الاستلام (received) لكل من له نفس المنطقة والتخصص */
const VISIBLE_UNTIL_CLOSED = "finished" as const;

const TICKET_SELECT =
  "id, ticket_number, external_ticket_number, location, description, status, created_at, assigned_technician_id, assigned_supervisor_id, assigned_engineer_id, zone_id, category_id, category, ticket_categories(name), zones(name)";

type TicketRow = {
  zone_id: string | null;
  category_id: number | null;
  assigned_technician_id: string | null;
  assigned_supervisor_id: string | null;
  assigned_engineer_id: string | null;
  zones?: { name?: string } | { name?: string }[] | null;
  ticket_categories?: { name: string } | { name: string }[] | null;
};

function zoneNameFromTicket(row: TicketRow): string | null {
  const z = row.zones;
  if (!z) return null;
  const o = Array.isArray(z) ? z[0] : z;
  return o?.name ?? null;
}

function categoryNameFromTicket(row: TicketRow): string | null {
  const c = row.ticket_categories;
  if (!c) return null;
  const o = Array.isArray(c) ? c[0] : c;
  return o?.name ?? null;
}

function rowMatchesPoolFilters(
  row: TicketRow,
  specialty: string | null,
  region: string | null,
): boolean {
  const zname = zoneNameFromTicket(row);
  if (region && zname && region !== zname) {
    return false;
  }
  return ticketCategoryNameMatchesSpecialty(categoryNameFromTicket(row), specialty);
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
    .select("role, specialty, region")
    .eq("id", user.id)
    .single();

  if (meError || !me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const role = me.role as string;
  if (!["technician", "supervisor"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const specialty = (me.specialty as string | null) ?? null;
  const region = (me.region as string | null)?.trim() || null;

  try {
    const { data: myTickets, error: myErr } = await supabase
      .from("tickets")
      .select(TICKET_SELECT)
      .neq("status", VISIBLE_UNTIL_CLOSED)
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
      .neq("status", VISIBLE_UNTIL_CLOSED)
      .order("created_at", { ascending: false });

    if (poolErr) {
      return NextResponse.json({ error: poolErr.message }, { status: 400 });
    }

    const poolRows = (zonePool ?? []) as TicketRow[];
    const filteredPool = poolRows.filter((row) => rowMatchesPoolFilters(row, specialty, region));

    /** لا نُخفِ البلاغ من المنطقة بعد التعيين — يظل ظاهراً لزملاء المنطقة/التخصص حتى finished */
    const areaTickets = filteredPool;

    return NextResponse.json({
      areaTickets,
      myTickets: myTickets ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
