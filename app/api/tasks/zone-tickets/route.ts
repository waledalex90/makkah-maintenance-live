import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ZONE_TICKET_WITH_HANDLER_PROFILES } from "@/lib/ticket-handler-select";
import { ticketCategoryNameMatchesSpecialty } from "@/lib/specialty-category-match";

/** كل الحالات عدا finished — يبقى البلاغ ظاهراً بعد الاستلام (received) لكل من له نفس المنطقة والتخصص */
const VISIBLE_UNTIL_CLOSED = "finished" as const;

const TICKET_SELECT = ZONE_TICKET_WITH_HANDLER_PROFILES;

type TicketRow = {
  id: string;
  created_at: string;
  zone_id: string | null;
  category_id: number | null;
  assigned_technician_id: string | null;
  assigned_supervisor_id: string | null;
  assigned_engineer_id: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  assigned_technician?: { full_name: string } | null;
  assigned_supervisor?: { full_name: string } | null;
  assigned_engineer?: { full_name: string } | null;
  closed_by_profile?: { full_name: string } | null;
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

/** إدخال بيانات: يرى كل البلاغات في مناطقه دون فلترة تخصص/منطقة نصية أو تعيين */
function appliesSpecialtyRegionPoolFilter(role: string): boolean {
  return role !== "data_entry";
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
    .select("role, specialty, region, access_work_list")
    .eq("id", user.id)
    .single();

  if (meError || !me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const role = me.role as string;
  const allowed =
    Boolean(me.access_work_list) ||
    role === "technician" ||
    role === "supervisor" ||
    role === "engineer" ||
    role === "data_entry";
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const specialty = (me.specialty as string | null) ?? null;
  const region = (me.region as string | null)?.trim() || null;
  const poolFilter = appliesSpecialtyRegionPoolFilter(role);

  try {
    const mineOr = `assigned_technician_id.eq.${user.id},assigned_supervisor_id.eq.${user.id},assigned_engineer_id.eq.${user.id}`;

    const { data: myTickets, error: myErr } = await supabase
      .from("tickets")
      .select(TICKET_SELECT)
      .neq("status", VISIBLE_UNTIL_CLOSED)
      .or(mineOr)
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
      const { data: doneMineOnly, error: doneMineOnlyErr } = await supabase
        .from("tickets")
        .select(TICKET_SELECT)
        .eq("status", "finished")
        .or(mineOr)
        .order("closed_at", { ascending: false, nullsFirst: false })
        .limit(120);
      if (doneMineOnlyErr) {
        return NextResponse.json({ error: doneMineOnlyErr.message }, { status: 400 });
      }
      const completedOnlyMine = ((doneMineOnly ?? []) as unknown as TicketRow[]).filter((row) =>
        poolFilter ? rowMatchesPoolFilters(row, specialty, region) : true,
      );
      return NextResponse.json({
        areaTickets: [],
        myTickets: myTickets ?? [],
        completedTickets: completedOnlyMine,
      });
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

    const poolRows = (zonePool ?? []) as unknown as TicketRow[];
    const filteredPool = poolFilter
      ? poolRows.filter((row) => rowMatchesPoolFilters(row, specialty, region))
      : poolRows;

    /** لا نُخفِ البلاغ من المنطقة بعد التعيين — يظل ظاهراً لزملاء المنطقة/التخصص حتى finished */
    const areaTickets = filteredPool;

    const { data: doneMine, error: doneMineErr } = await supabase
      .from("tickets")
      .select(TICKET_SELECT)
      .eq("status", "finished")
      .or(mineOr)
      .order("closed_at", { ascending: false, nullsFirst: false })
      .limit(120);

    if (doneMineErr) {
      return NextResponse.json({ error: doneMineErr.message }, { status: 400 });
    }

    let doneArea: TicketRow[] = [];
    if (zoneIds.length > 0) {
      const { data: da, error: daErr } = await supabase
        .from("tickets")
        .select(TICKET_SELECT)
        .eq("status", "finished")
        .in("zone_id", zoneIds)
        .order("closed_at", { ascending: false, nullsFirst: false })
        .limit(120);
      if (daErr) {
        return NextResponse.json({ error: daErr.message }, { status: 400 });
      }
      doneArea = (da ?? []) as unknown as TicketRow[];
    }

    const doneMineRows = (doneMine ?? []) as unknown as TicketRow[];
    const mergedDone = new Map<string, TicketRow>();
    for (const r of [...doneMineRows, ...doneArea]) {
      if (poolFilter && !rowMatchesPoolFilters(r, specialty, region)) continue;
      mergedDone.set(r.id, r);
    }
    const completedTickets = [...mergedDone.values()].sort((a, b) => {
      const ta = new Date((a as { closed_at?: string | null }).closed_at ?? a.created_at).getTime();
      const tb = new Date((b as { closed_at?: string | null }).closed_at ?? b.created_at).getTime();
      return tb - ta;
    });

    return NextResponse.json({
      areaTickets,
      myTickets: myTickets ?? [],
      completedTickets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
