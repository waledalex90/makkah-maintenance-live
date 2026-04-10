import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const OPEN_STATUSES = ["new", "assigned", "on_the_way", "arrived"];

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
    const admin = createSupabaseAdminClient();

    const { data: zoneLinks, error: zoneError } = await admin
      .from("zone_profiles")
      .select("zone_id")
      .eq("profile_id", user.id);
    if (zoneError) return NextResponse.json({ error: zoneError.message }, { status: 400 });

    const zoneIds = (zoneLinks ?? []).map((row) => row.zone_id as string);
    if (zoneIds.length === 0) return NextResponse.json({ tickets: [] });

    const { data, error } = await admin
      .from("tickets")
      .select("id, ticket_number, external_ticket_number, location, description, status, created_at, assigned_technician_id, assigned_supervisor_id, zone_id, ticket_categories(name)")
      .in("zone_id", zoneIds)
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ tickets: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
