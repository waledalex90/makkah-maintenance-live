"use client";

import { useEffect, useMemo, useState } from "react";
import { LatLngBounds, divIcon, latLng } from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { toast } from "sonner";
import { TicketDetailDrawer } from "@/components/ticket-detail-drawer";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

type TicketStatus = "new" | "assigned" | "on_the_way" | "arrived" | "fixed";

type Zone = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

type TicketRow = {
  id: string;
  location: string;
  description: string;
  status: TicketStatus;
  zone_id: string | null;
  created_at: string;
};

type ProfileRole = "admin" | "engineer" | "supervisor" | "technician";

type ProfileJoin = {
  full_name: string;
  role: ProfileRole;
};

type LiveLocationRow = {
  user_id: string;
  latitude: number;
  longitude: number;
  last_updated: string;
  profiles?: ProfileJoin | ProfileJoin[] | null;
};

const MAKKAH_CENTER: [number, number] = [21.4225, 39.8262];
const DEFAULT_ZOOM = 11;

function getStatusBadgeVariant(status: TicketStatus): "red" | "yellow" | "green" | "muted" {
  if (status === "new") return "red";
  if (status === "on_the_way") return "yellow";
  if (status === "fixed") return "green";
  return "yellow";
}

function statusLabel(status: TicketStatus): string {
  if (status === "new") return "جديد";
  if (status === "assigned") return "مُسند";
  if (status === "on_the_way") return "في الطريق";
  if (status === "arrived") return "تم الوصول";
  return "تم الإصلاح";
}

function roleColor(role: ProfileRole): string {
  if (role === "technician") return "#2563eb";
  if (role === "supervisor") return "#7c3aed";
  return "#0f172a";
}

function ticketColor(status: TicketStatus): string {
  if (status === "new") return "#dc2626";
  return "#ca8a04";
}

function circleIcon(color: string) {
  return divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(15,23,42,0.25);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

function normalizeProfile(profile: LiveLocationRow["profiles"]): ProfileJoin | null {
  if (!profile) return null;
  if (Array.isArray(profile)) return profile[0] ?? null;
  return profile;
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

export function OperationsMap() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeTickets, setActiveTickets] = useState<TicketRow[]>([]);
  const [liveLocations, setLiveLocations] = useState<LiveLocationRow[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    zones.forEach((zone) => map.set(zone.id, zone));
    return map;
  }, [zones]);

  const fitPoints = useMemo(() => {
    const points: Array<[number, number]> = [];

    liveLocations.forEach((loc) => {
      points.push([loc.latitude, loc.longitude]);
    });

    activeTickets.forEach((ticket) => {
      if (!ticket.zone_id) return;
      const zone = zoneMap.get(ticket.zone_id);
      if (!zone) return;
      if (zone.latitude === null || zone.longitude === null) return;
      points.push([zone.latitude, zone.longitude]);
    });

    return points;
  }, [liveLocations, activeTickets, zoneMap]);

  const loadZones = async () => {
    const { data, error } = await supabase
      .from("zones")
      .select("id, name, latitude, longitude")
      .order("name");

    if (error) {
      toast.error(error.message);
      return;
    }

    setZones((data as Zone[]) ?? []);
  };

  const loadTickets = async () => {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, location, description, status, zone_id, created_at")
      .neq("status", "fixed")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      return;
    }

    setActiveTickets((data as TicketRow[]) ?? []);
  };

  const loadLiveLocations = async () => {
    const { data, error } = await supabase
      .from("live_locations")
      .select("user_id, latitude, longitude, last_updated, profiles(full_name, role)");

    if (error) {
      toast.error(error.message);
      return;
    }

    const rows = ((data as LiveLocationRow[]) ?? []).filter((row) => {
      const profile = normalizeProfile(row.profiles);
      return profile?.role === "technician" || profile?.role === "supervisor";
    });

    setLiveLocations(rows);
  };

  useEffect(() => {
    void Promise.all([loadZones(), loadTickets(), loadLiveLocations()]);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("map-realtime-sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_locations" },
        () => {
          void loadLiveLocations();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_locations" },
        () => {
          void loadLiveLocations();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        () => {
          void loadTickets();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        async (payload) => {
          const updated = payload.new as TicketRow;
          if (updated.status === "fixed") {
            setActiveTickets((prev) => prev.filter((ticket) => ticket.id !== updated.id));
          } else {
            setActiveTickets((prev) => {
              const exists = prev.some((ticket) => ticket.id === updated.id);
              if (exists) {
                return prev.map((ticket) => (ticket.id === updated.id ? { ...ticket, ...updated } : ticket));
              }
              return [updated, ...prev];
            });
          }

          if (selectedTicket?.id === updated.id) {
            setSelectedTicket((prev) => (prev ? { ...prev, ...updated } : prev));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedTicket?.id]);

  const openTicket = (ticket: TicketRow) => {
    setSelectedTicket(ticket);
    setDrawerOpen(true);
  };

  const refreshTicketAfterAction = async () => {
    await loadTickets();
    if (!selectedTicket) return;

    const { data } = await supabase
      .from("tickets")
      .select("id, location, description, status, zone_id, created_at")
      .eq("id", selectedTicket.id)
      .single();

    if (data) {
      setSelectedTicket(data as TicketRow);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" dir="rtl" lang="ar">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">خريطة المشاعر التفاعلية</h1>
        <p className="text-sm text-slate-500">الفرق الميدانية المباشرة والبلاغات النشطة</p>
      </div>

      <div className="relative h-[72vh] overflow-hidden rounded-lg border border-slate-200">
        <MapContainer center={MAKKAH_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitMapBounds points={fitPoints} />

          <MarkerClusterGroup chunkedLoading>
            {liveLocations.map((loc) => {
              const profile = normalizeProfile(loc.profiles);
              if (!profile) return null;

              return (
                <Marker
                  key={`staff-${loc.user_id}`}
                  position={[loc.latitude, loc.longitude]}
                  icon={circleIcon(roleColor(profile.role))}
                >
                  <Popup>
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{profile.full_name}</p>
                      <p>الدور: {profile.role}</p>
                      <p>آخر تحديث: {new Date(loc.last_updated).toLocaleTimeString()}</p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {activeTickets.map((ticket) => {
              if (!ticket.zone_id) return null;
              const zone = zoneMap.get(ticket.zone_id);
              if (!zone) return null;
              if (zone.latitude === null || zone.longitude === null) return null;

              return (
                <Marker
                  key={`ticket-${ticket.id}`}
                  position={[zone.latitude, zone.longitude]}
                  icon={circleIcon(ticketColor(ticket.status))}
                  eventHandlers={{
                    click: () => {
                      openTicket(ticket);
                    },
                  }}
                >
                  <Popup>
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{ticket.location}</p>
                      <p>المنطقة: {zone.name}</p>
                      <div className="pt-1">
                        <Badge variant={getStatusBadgeVariant(ticket.status)}>{statusLabel(ticket.status)}</Badge>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        </MapContainer>

        <div className="absolute right-3 top-3 z-[500] rounded-md border border-slate-200 bg-white/95 p-3 text-xs shadow">
          <p className="mb-2 font-semibold text-slate-800">المفاتيح</p>
          <div className="space-y-1.5 text-slate-700">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> فني</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-600" /> مشرف</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> بلاغ جديد</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-yellow-500" /> بلاغ تحت التنفيذ</div>
          </div>
        </div>
      </div>

      <TicketDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        ticket={selectedTicket}
        zoneName={selectedTicket?.zone_id ? zoneMap.get(selectedTicket.zone_id)?.name ?? "-" : "-"}
        onTicketUpdated={refreshTicketAfterAction}
        onMarkTicketRead={() => {
          // Unread tracking is handled in admin tickets table screen.
        }}
      />
    </section>
  );
}