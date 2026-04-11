import { supabase } from "@/lib/supabase";
import { effectivePermissions } from "@/lib/permissions";
import { type TicketStatus } from "@/lib/ticket-status";

export type ZoneJoin = { name: string } | { name: string }[] | null;

/** شكل عنصر بلاغ في قوائم الميدان (zone-tickets API). */
export type TechnicianTicket = {
  id: string;
  ticket_number: number | null;
  external_ticket_number: string | null;
  title?: string | null;
  location: string;
  description: string;
  status: TicketStatus;
  created_at: string;
  assigned_technician_id: string | null;
  assigned_supervisor_id: string | null;
  assigned_engineer_id?: string | null;
  zone_id: string | null;
  category?: string | null;
  ticket_categories?: { name: string } | { name: string }[] | null;
  zones?: ZoneJoin;
  closed_at?: string | null;
  closed_by?: string | null;
  assigned_technician?: { full_name: string } | null;
  assigned_supervisor?: { full_name: string } | null;
  assigned_engineer?: { full_name: string } | null;
  closed_by_profile?: { full_name: string } | null;
};

/** حزمة واحدة من /api/tasks/zone-tickets — تابّا المنطقة و«مهامي» من نفس الاستجابة. */
export const ZONE_TICKETS_QUERY_KEY = ["zone-tickets"] as const;

export const ZONE_TICKETS_AREA_KEY = ["zone-tickets", "area"] as const;
export const ZONE_TICKETS_MINE_KEY = ["zone-tickets", "mine"] as const;

export type ZoneTicketsWorkspacePayload = {
  areaTickets: TechnicianTicket[];
  myTickets: TechnicianTicket[];
  myUserId: string;
  canViewMap: boolean;
};

/** يُستدعى من useQuery — يرمي عند فشل الشبكة أو انتهاء الجلسة (رمز SESSION). */
export async function fetchZoneTicketsWorkspace(): Promise<ZoneTicketsWorkspacePayload> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("SESSION");
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const canViewMap = effectivePermissions(
    profileRow?.role,
    profileRow?.permissions as Record<string, unknown> | null,
  ).view_map;

  const res = await fetch("/api/tasks/zone-tickets", { cache: "no-store" });
  const payload = (await res.json()) as {
    areaTickets?: TechnicianTicket[];
    myTickets?: TechnicianTicket[];
    tickets?: TechnicianTicket[];
    error?: string;
  };

  if (!res.ok) {
    throw new Error(payload.error ?? "FETCH");
  }

  let areaTickets: TechnicianTicket[];
  let myTickets: TechnicianTicket[];

  if (payload.tickets && !payload.areaTickets) {
    areaTickets = [];
    myTickets = payload.tickets ?? [];
  } else {
    areaTickets = payload.areaTickets ?? [];
    myTickets = payload.myTickets ?? [];
  }

  return {
    areaTickets,
    myTickets,
    myUserId: user.id,
    canViewMap,
  };
}
