"use client";

import { useEffect, useMemo, useState } from "react";
import { divIcon, LatLngBounds, latLng } from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TicketDetailDrawer } from "@/components/ticket-detail-drawer";

type Zone = {
  id: string;
  name: string;
  center_latitude?: number | null;
  center_longitude?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

type TicketStatus = "new" | "assigned" | "on_the_way" | "arrived" | "fixed";

type TicketRow = {
  id: string;
  location: string;
  description: string;
  status: TicketStatus;
  assigned_engineer_id?: string | null;
  assigned_supervisor_id?: string | null;
  assigned_technician_id?: string | null;
  zone_id: string | null;
  created_at: string;
};

type TicketChatRow = {
  ticket_id: string;
  sent_at: string;
};

type ProfileRole = "admin" | "engineer" | "supervisor" | "technician" | "reporter" | "project_manager" | "projects_director";

type ProfileJoin = {
  full_name: string;
  role: ProfileRole;
};

type LiveLocationRow = {
  user_id: string;
  latitude: number;
  longitude: number;
  last_updated: string;
  zone_id?: string | null;
  profiles?: ProfileJoin | ProfileJoin[] | null;
};

const IN_PROGRESS_STATUSES: TicketStatus[] = ["assigned", "on_the_way", "arrived"];
const PAGE_SIZE = 10;
const LAST_READ_STORAGE_KEY = "admin_ticket_last_read_map";
const OVERDUE_HOURS = 4;
const MAKKAH_CENTER: [number, number] = [21.4225, 39.8262];
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const ZONE_RADIUS_METERS = 2500;

function normalizeProfile(profile: LiveLocationRow["profiles"]): ProfileJoin | null {
  if (!profile) return null;
  if (Array.isArray(profile)) return profile[0] ?? null;
  return profile;
}

function roleColor(role: ProfileRole): string {
  if (role === "technician") return "#2563eb";
  if (role === "engineer") return "#0f766e";
  return "#475569";
}

function statusColor(status: TicketStatus): string {
  if (status === "new") return "#dc2626";
  if (status === "fixed") return "#16a34a";
  return "#ca8a04";
}

function labelMarkerIcon(color: string, label: string) {
  const safeLabel = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;transform:translateY(-8px)">
      <span style="font-size:11px;background:#fff;padding:2px 6px;border-radius:9999px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.12);white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis;">${safeLabel}</span>
      <span style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,0.25);animation:fleetPulse 1.4s ease-in-out infinite;"></span>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

function getZoneCenter(zone: Zone | undefined): [number, number] | null {
  if (!zone) return null;
  const lat = zone.center_latitude ?? zone.latitude ?? null;
  const lng = zone.center_longitude ?? zone.longitude ?? null;
  if (lat === null || lng === null) return null;
  return [lat, lng];
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

type FocusZoneProps = { center: [number, number] | null };
function FocusZone({ center }: FocusZoneProps) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.setView(center, 14, { animate: true });
  }, [map, center]);
  return null;
}

type FitMapBoundsProps = {
  points: Array<[number, number]>;
};

function FitMapBounds({ points }: FitMapBoundsProps) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    const bounds = new LatLngBounds(points.map((point) => latLng(point[0], point[1])));
    map.fitBounds(bounds.pad(0.2), { animate: true });
  }, [map, points]);
  return null;
}

function statusBadgeVariant(status: TicketStatus): "red" | "yellow" | "green" | "muted" {
  if (status === "new") return "red";
  if (status === "on_the_way") return "yellow";
  if (status === "fixed") return "green";
  return "muted";
}

export function AdminDashboardContent() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [allTickets, setAllTickets] = useState<TicketRow[]>([]);
  const [liveLocations, setLiveLocations] = useState<LiveLocationRow[]>([]);
  const [pageTickets, setPageTickets] = useState<TicketRow[]>([]);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [mapZoneFilter, setMapZoneFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [latestChatMap, setLatestChatMap] = useState<Record<string, string>>({});
  const [lastReadMap, setLastReadMap] = useState<Record<string, string>>({});
  const [nowTs, setNowTs] = useState(() => Date.now());

  const zoneNameMap = useMemo(() => {
    const map = new Map<string, string>();
    zones.forEach((zone) => map.set(zone.id, zone.name));
    return map;
  }, [zones]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAST_READ_STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLastReadMap(JSON.parse(stored) as Record<string, string>);
      }
    } catch {
      setLastReadMap({});
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LAST_READ_STORAGE_KEY, JSON.stringify(lastReadMap));
  }, [lastReadMap]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadZones = async () => {
    const { data, error } = await supabase
      .from("zones")
      .select("id, name, center_latitude, center_longitude, latitude, longitude")
      .order("name");
    if (error) {
      toast.error(error.message);
      return;
    }
    setZones(data ?? []);
  };

  const loadLiveLocations = async () => {
    const { data, error } = await supabase
      .from("live_locations")
      .select("user_id, latitude, longitude, last_updated, profiles(full_name, role)");
    if (error) {
      return;
    }
    const rows = ((data as LiveLocationRow[]) ?? []).filter((row) => {
      const profile = normalizeProfile(row.profiles);
      return profile?.role === "technician" || profile?.role === "engineer";
    });
    setLiveLocations(rows);
  };

  const loadStats = async () => {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, location, description, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      return;
    }

    setAllTickets((data as TicketRow[]) ?? []);
  };

  const loadLatestChatsForTickets = async (ticketIds: string[]) => {
    if (ticketIds.length === 0) {
      setLatestChatMap({});
      return;
    }

    const { data, error } = await supabase
      .from("ticket_chats")
      .select("ticket_id, sent_at")
      .in("ticket_id", ticketIds)
      .order("sent_at", { ascending: false });

    if (error) {
      return;
    }

    const map: Record<string, string> = {};
    ((data as TicketChatRow[]) ?? []).forEach((row) => {
      if (!map[row.ticket_id]) {
        map[row.ticket_id] = row.sent_at;
      }
    });
    setLatestChatMap(map);
  };

  const loadPage = async () => {
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("tickets")
      .select("id, location, description, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (zoneFilter !== "all") {
      query = query.eq("zone_id", zoneFilter);
    }

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const q = searchTerm.trim();
    if (q) {
      query = query.or(`location.ilike.%${q}%,id.ilike.%${q}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      toast.error(error.message);
      return;
    }

    const rows = (data as TicketRow[]) ?? [];
    setPageTickets(rows);
    setTotalCount(count ?? 0);
    await loadLatestChatsForTickets(rows.map((ticket) => ticket.id));
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadZones(), loadStats(), loadLiveLocations()]);
      await loadPage();
      setLoading(false);
    };

    void init();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [zoneFilter, statusFilter, searchTerm]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPage();
  }, [zoneFilter, statusFilter, searchTerm, currentPage]);

  const openTicketDrawer = async (ticket: TicketRow) => {
    setSelectedTicket(ticket);
    setDrawerOpen(true);
    setLastReadMap((prev) => ({ ...prev, [ticket.id]: new Date().toISOString() }));
  };

  const openTicketById = async (ticketId: string) => {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, location, description, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at")
      .eq("id", ticketId)
      .single();

    if (error || !data) {
      toast.error("Unable to open ticket details.");
      return;
    }

    await openTicketDrawer(data as TicketRow);
  };

  const refreshAfterDrawerAction = async () => {
    await Promise.all([loadStats(), loadPage()]);
    if (selectedTicket) {
      const { data } = await supabase
        .from("tickets")
        .select("id, location, description, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at")
        .eq("id", selectedTicket.id)
        .single();

      if (data) {
        setSelectedTicket(data as TicketRow);
      }
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel("tickets-admin-advanced-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        (payload) => {
          const newTicket = payload.new as TicketRow;
          toast.success(`New ticket: ${newTicket.location}`, {
            action: {
              label: "Open",
              onClick: () => {
                void openTicketById(newTicket.id);
              },
            },
          });
          void loadStats();
          void loadPage();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        async (payload) => {
          const updated = payload.new as TicketRow;
          setPageTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, status: updated.status } : t)));
          if (selectedTicket?.id === updated.id) {
            setSelectedTicket((prev) => (prev ? { ...prev, status: updated.status } : prev));
          }
          await Promise.all([loadStats(), loadPage()]);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_chats" },
        (payload) => {
          const row = payload.new as TicketChatRow;
          setLatestChatMap((prev) => ({ ...prev, [row.ticket_id]: row.sent_at }));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_locations" },
        () => {
          void loadLiveLocations();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedTicket?.id]);

  const stats = useMemo(() => {
    const active = allTickets.filter((t) => IN_PROGRESS_STATUSES.includes(t.status)).length;
    const pending = allTickets.filter((t) => t.status === "new").length;
    const completed = allTickets.filter((t) => t.status === "fixed").length;
    const overdue = allTickets.filter((t) => {
      if (t.status === "fixed") return false;
      const createdMs = new Date(t.created_at).getTime();
      return nowTs - createdMs > OVERDUE_HOURS * 60 * 60 * 1000;
    }).length;
    return { active, pending, completed, overdue };
  }, [allTickets, nowTs]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const busyUserIds = useMemo(() => {
    const ids = new Set<string>();
    allTickets.forEach((ticket) => {
      if (ticket.status === "fixed") return;
      if (ticket.assigned_engineer_id) ids.add(ticket.assigned_engineer_id);
      if (ticket.assigned_supervisor_id) ids.add(ticket.assigned_supervisor_id);
      if (ticket.assigned_technician_id) ids.add(ticket.assigned_technician_id);
    });
    return ids;
  }, [allTickets]);
  const mapTickets = useMemo(
    () => (mapZoneFilter === "all" ? allTickets : allTickets.filter((t) => t.zone_id === mapZoneFilter)),
    [allTickets, mapZoneFilter],
  );
  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    zones.forEach((zone) => map.set(zone.id, zone));
    return map;
  }, [zones]);
  const selectedZoneCenter = useMemo(() => {
    if (mapZoneFilter === "all") return null;
    return getZoneCenter(zoneMap.get(mapZoneFilter));
  }, [mapZoneFilter, zoneMap]);
  const visibleFleet = useMemo(() => {
    if (mapZoneFilter === "all") return liveLocations;
    const center = selectedZoneCenter;
    if (!center) return [];
    return liveLocations.filter((loc) => distanceMeters(loc.latitude, loc.longitude, center[0], center[1]) <= ZONE_RADIUS_METERS);
  }, [liveLocations, mapZoneFilter, selectedZoneCenter]);
  const mapPoints = useMemo(() => {
    const points: Array<[number, number]> = [];
    visibleFleet.forEach((loc) => points.push([loc.latitude, loc.longitude]));
    mapTickets.forEach((ticket) => {
      if (!ticket.zone_id) return;
      const zone = zoneMap.get(ticket.zone_id);
      if (!zone) return;
      const lat = zone.center_latitude ?? zone.latitude ?? null;
      const lng = zone.center_longitude ?? zone.longitude ?? null;
      if (lat === null || lng === null) return;
      points.push([lat, lng]);
    });
    return points;
    if (points.length === 0 && selectedZoneCenter) {
      points.push(selectedZoneCenter);
    }
    return points;
  }, [visibleFleet, mapTickets, zoneMap, selectedZoneCenter]);

  return (
    <div className="space-y-6" dir="rtl" lang="ar">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardTitle>البلاغات النشطة (Active)</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-sky-700">{stats.active}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>البلاغات المعلقة (Pending)</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-amber-600">{stats.pending}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>البلاغات المنتهية (Completed)</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-green-600">{stats.completed}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>البلاغات المتأخرة (Overdue)</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-red-600">{stats.overdue}</p></CardContent></Card>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">المراقبة اللحظية للخريطة (Real-time Monitoring)</h2>
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={mapZoneFilter}
            onChange={(e) => setMapZoneFilter(e.target.value)}
          >
            <option value="all">كل المناطق</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>{zone.name}</option>
            ))}
          </select>
        </div>
        <div className="relative h-[58vh] overflow-hidden rounded-lg border border-slate-200">
          <MapContainer center={MAKKAH_CENTER} zoom={11} scrollWheelZoom className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitMapBounds points={mapPoints} />
            <FocusZone center={selectedZoneCenter} />
            {visibleFleet.map((loc) => {
              const profile = normalizeProfile(loc.profiles);
              if (!profile) return null;
              const isOnline = nowTs - new Date(loc.last_updated).getTime() <= ONLINE_WINDOW_MS;
              const color = !isOnline ? "#9ca3af" : busyUserIds.has(loc.user_id) ? "#dc2626" : "#16a34a";
              const roleLabel = profile.role === "technician" ? "فني" : profile.role === "engineer" ? "مهندس" : profile.role;
              return (
                <Marker
                  key={`live-${loc.user_id}`}
                  position={[loc.latitude, loc.longitude]}
                  icon={labelMarkerIcon(color, profile.full_name)}
                >
                  <Tooltip direction="top" offset={[0, -12]} opacity={1} permanent>
                    {profile.full_name}
                  </Tooltip>
                  <Tooltip direction="bottom" offset={[0, 12]} opacity={0.95}>
                    {isOnline ? (busyUserIds.has(loc.user_id) ? `مشغول - ${roleLabel}` : `متاح - ${roleLabel}`) : `غير متصل - ${roleLabel}`}
                  </Tooltip>
                </Marker>
              );
            })}
            {mapTickets.map((ticket) => {
              if (!ticket.zone_id) return null;
              const zone = zoneMap.get(ticket.zone_id);
              if (!zone) return null;
              const lat = zone.center_latitude ?? zone.latitude ?? null;
              const lng = zone.center_longitude ?? zone.longitude ?? null;
              if (lat === null || lng === null) return null;
              return (
                <Marker
                  key={`ticket-${ticket.id}`}
                  position={[lat, lng]}
                  icon={labelMarkerIcon(statusColor(ticket.status), ticket.location)}
                  eventHandlers={{ click: () => void openTicketDrawer(ticket) }}
                />
              );
            })}
          </MapContainer>
        </div>
        <style jsx>{`
          @keyframes fleetPulse {
            0% { transform: scale(1); opacity: 0.95; }
            50% { transform: scale(1.25); opacity: 0.65; }
            100% { transform: scale(1); opacity: 0.95; }
          }
        `}</style>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="mb-2 text-sm font-medium">Zone</p>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
            >
              <option value="all">All zones</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Status</p>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="assigned">Assigned</option>
              <option value="on_the_way">On the way</option>
              <option value="arrived">Arrived</option>
              <option value="fixed">Fixed</option>
            </select>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Quick Search</p>
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by room or location"
            />
          </div>
        </div>

        <p className="mb-2 text-xs text-slate-500">Sorted by newest first (Created At desc)</p>

        {loading ? (
          <p className="text-sm text-slate-500">Loading tickets...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Zone</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {pageTickets.map((ticket) => {
                  const latestChatAt = latestChatMap[ticket.id];
                  const lastReadAt = lastReadMap[ticket.id];
                  const hasUnread = Boolean(
                    latestChatAt && (!lastReadAt || new Date(latestChatAt).getTime() > new Date(lastReadAt).getTime()),
                  );

                  return (
                    <tr
                      key={ticket.id}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => void openTicketDrawer(ticket)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{ticket.id.slice(0, 8)}</td>
                      <td className="px-3 py-2">{ticket.location}</td>
                      <td className="px-3 py-2">{ticket.zone_id ? zoneNameMap.get(ticket.zone_id) ?? "-" : "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={statusBadgeVariant(ticket.status)}>{ticket.status}</Badge>
                          {hasUnread ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> : null}
                        </div>
                      </td>
                      <td className="max-w-xs truncate px-3 py-2">{ticket.description}</td>
                    </tr>
                  );
                })}
                {pageTickets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">No tickets found for current filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">Page {currentPage} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <button
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <TicketDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        ticket={selectedTicket}
        zoneName={selectedTicket?.zone_id ? zoneNameMap.get(selectedTicket.zone_id) ?? "-" : "-"}
        onTicketUpdated={refreshAfterDrawerAction}
        onMarkTicketRead={(ticketId, readAt) => setLastReadMap((prev) => ({ ...prev, [ticketId]: readAt }))}
      />
    </div>
  );
}