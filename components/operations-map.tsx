"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { LatLngBounds, divIcon, latLng } from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { LayersControl, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { toast } from "sonner";
import { TicketDetailDrawer } from "@/components/ticket-detail-drawer";
import { Badge } from "@/components/ui/badge";
import { isFleetMapRole } from "@/lib/fleet-map-roles";
import { fleetPinDotOnly } from "@/lib/map-fleet-marker";
import {
  getLeafletTileProps,
  getMapTilerApiKey,
  mapTilerSatelliteTileUrl,
  MAPTILER_ATTRIBUTION,
} from "@/lib/maptiler";
import { supabase } from "@/lib/supabase";
import { formatSaudiDateTime } from "@/lib/saudi-time";
import { type TicketStatus, statusBadgeVariant, statusLabelAr } from "@/lib/ticket-status";

type Zone = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

type TicketRow = {
  id: string;
  ticket_number?: number | null;
  external_ticket_number?: string | null;
  title?: string | null;
  location: string;
  description: string;
  status: TicketStatus;
  zone_id: string | null;
  category_id?: number | null;
  ticket_categories?: { name: string } | { name: string }[] | null;
  assigned_engineer_id: string | null;
  assigned_supervisor_id?: string | null;
  assigned_technician_id?: string | null;
  created_at: string;
  closed_at?: string | null;
};

type StaffRole =
  | "engineer"
  | "supervisor"
  | "technician"
  | "reporter"
  | "project_manager"
  | "projects_director";

type ProfileJoin = {
  full_name: string;
  role: StaffRole | "admin";
  specialty?: string | null;
  mobile?: string | null;
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

function roleColor(role: string): string {
  if (role === "technician") return "#2563eb";
  if (role === "supervisor") return "#7c3aed";
  if (role === "engineer") return "#0f172a";
  if (role === "reporter") return "#ea580c";
  if (role === "project_manager") return "#0891b2";
  if (role === "projects_director") return "#be123c";
  return "#64748b";
}

function roleLabelAr(role: string): string {
  if (role === "technician") return "فني";
  if (role === "supervisor") return "مراقب";
  if (role === "engineer") return "مهندس";
  if (role === "reporter") return "مدخل بيانات";
  if (role === "project_manager") return "مدير مشروع";
  if (role === "projects_director") return "مدير المشاريع";
  return role;
}

function ticketColor(status: TicketStatus): string {
  if (status === "not_received") return "#dc2626";
  if (status === "finished") return "#16a34a";
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
  const hereTrafficKey = process.env.NEXT_PUBLIC_HERE_TRAFFIC_API_KEY;
  const mapTilerKey = getMapTilerApiKey();
  const streetsTileProps = getLeafletTileProps();

  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    zones.forEach((zone) => map.set(zone.id, zone));
    return map;
  }, [zones]);

  const visibleFleet = useMemo(() => {
    return liveLocations.filter((loc) => {
      const profile = normalizeProfile(loc.profiles);
      return Boolean(profile && isFleetMapRole(profile.role));
    });
  }, [liveLocations]);

  const fitPoints = useMemo(() => {
    const points: Array<[number, number]> = [];

    visibleFleet.forEach((loc) => {
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
  }, [visibleFleet, activeTickets, zoneMap]);

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
      .select(
        "id, ticket_number, external_ticket_number, title, location, description, status, zone_id, category_id, ticket_categories(name), assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, created_at, closed_at",
      )
      .neq("status", "finished")
      .order("created_at", { ascending: false })
      .limit(350);

    if (error) {
      toast.error(error.message);
      return;
    }

    setActiveTickets((data as TicketRow[]) ?? []);
  };

  const loadLiveLocations = async () => {
    const { data, error } = await supabase
      .from("live_locations")
      .select("user_id, latitude, longitude, last_updated, profiles(full_name, role, specialty, mobile)");

    if (error) {
      toast.error(error.message);
      return;
    }

    const rows = (data as LiveLocationRow[]) ?? [];
    setLiveLocations(
      rows.filter((loc) => {
        const p = normalizeProfile(loc.profiles);
        return Boolean(p && isFleetMapRole(p.role));
      }),
    );
  };

  useEffect(() => {
    void Promise.all([loadZones(), loadTickets(), loadLiveLocations()]);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("map-realtime-sync-v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_locations" },
        async (payload) => {
          const row = payload.new as LiveLocationRow;
          const { data: profileData } = await supabase
            .from("profiles")
            .select("full_name, role, specialty, mobile")
            .eq("id", row.user_id)
            .single();
          const profile = profileData as ProfileJoin | null;
          if (!profile || !isFleetMapRole(profile.role)) return;
          setLiveLocations((prev) => {
            const exists = prev.some((item) => item.user_id === row.user_id);
            const nextRow: LiveLocationRow = { ...row, profiles: profile };
            if (exists) return prev.map((item) => (item.user_id === row.user_id ? nextRow : item));
            return [nextRow, ...prev];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_locations" },
        async (payload) => {
          const row = payload.new as LiveLocationRow;
          setLiveLocations((prev) => {
            const i = prev.findIndex((item) => item.user_id === row.user_id);
            if (i < 0) return prev;
            const next = [...prev];
            next[i] = {
              ...next[i],
              latitude: row.latitude,
              longitude: row.longitude,
              last_updated: row.last_updated,
            };
            return next;
          });
          const { data: profileData } = await supabase
            .from("profiles")
            .select("full_name, role, specialty, mobile")
            .eq("id", row.user_id)
            .single();
          const profile = profileData as ProfileJoin | null;
          if (!profile || !isFleetMapRole(profile.role)) {
            setLiveLocations((prev) => prev.filter((item) => item.user_id !== row.user_id));
            return;
          }
          setLiveLocations((prev) =>
            prev.map((item) => (item.user_id === row.user_id ? { ...item, ...row, profiles: profile } : item)),
          );
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
          if (updated.status === "finished") {
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
      .select(
        "id, ticket_number, external_ticket_number, title, location, description, status, zone_id, category_id, ticket_categories(name), assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, created_at, closed_at",
      )
      .eq("id", selectedTicket.id)
      .single();

    if (data) {
      setSelectedTicket(data as TicketRow);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900" dir="rtl" lang="ar">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">خريطة الميدان والبلاغات النشطة</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">الفرق الميدانية المباشرة والبلاغات النشطة</p>
      </div>

      {!mapTilerKey ? (
        <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          لتفعيل طبقة MapTiler Streets: أضف <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">NEXT_PUBLIC_MAPTILER_API_KEY</code> في{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">.env.local</code>. حالياً تُستخدم خريطة OpenStreetMap احتياطياً.
        </p>
      ) : null}

      <div className="relative isolate z-0 h-[min(68dvh,calc(100dvh-11rem))] overflow-hidden rounded-lg border border-slate-200 md:h-[72vh] dark:border-slate-800">
        <Link
          href="/dashboard"
          className="absolute left-3 top-3 z-[600] flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-lg transition hover:bg-slate-50 md:hidden dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          aria-label="إغلاق الخريطة والعودة للقائمة"
          prefetch={false}
        >
          <X className="h-6 w-6" strokeWidth={2.5} />
        </Link>
        <MapContainer center={MAKKAH_CENTER} zoom={DEFAULT_ZOOM} maxZoom={streetsTileProps.maxZoom} scrollWheelZoom className="h-full w-full">
          <LayersControl position="topleft">
            <LayersControl.BaseLayer checked name="MapTiler — الشوارع">
              <TileLayer
                attribution={streetsTileProps.attribution}
                url={streetsTileProps.url}
                maxNativeZoom={streetsTileProps.maxNativeZoom}
                maxZoom={streetsTileProps.maxZoom}
                crossOrigin={streetsTileProps.crossOrigin}
              />
            </LayersControl.BaseLayer>

            {mapTilerKey ? (
              <LayersControl.BaseLayer name="MapTiler — الأقمار الصناعية">
                <TileLayer
                  attribution={MAPTILER_ATTRIBUTION}
                  url={mapTilerSatelliteTileUrl(mapTilerKey)}
                  maxNativeZoom={22}
                  maxZoom={22}
                  crossOrigin
                />
              </LayersControl.BaseLayer>
            ) : null}

            {hereTrafficKey ? (
              <LayersControl.Overlay name="حركة المرور (HERE)">
                <TileLayer
                  attribution="Traffic &copy; HERE"
                  url={`https://{s}.traffic.maps.ls.hereapi.com/traffic/6.2/flowtile/newest/normal.day/{z}/{x}/{y}/512/png8?apiKey=${hereTrafficKey}`}
                  maxNativeZoom={20}
                  maxZoom={20}
                />
              </LayersControl.Overlay>
            ) : null}
          </LayersControl>

          <FitMapBounds points={fitPoints} />

          <MarkerClusterGroup chunkedLoading>
            {visibleFleet.map((loc) => {
              const profile = normalizeProfile(loc.profiles);
              if (!profile) return null;
              const tint = roleColor(profile.role);
              const displayName = profile.full_name.trim() || "—";

              return (
                <Marker
                  key={`staff-${loc.user_id}`}
                  position={[loc.latitude, loc.longitude]}
                  icon={fleetPinDotOnly(tint)}
                >
                  <Tooltip
                    direction="top"
                    offset={[0, -12]}
                    opacity={1}
                    permanent
                    className="!rounded-lg !border !border-slate-300 !bg-white !px-2.5 !py-1 !text-xs !font-semibold !text-slate-900 !shadow-md"
                  >
                    {displayName}
                  </Tooltip>
                  <Popup>
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{profile.full_name}</p>
                      <p>الدور: {roleLabelAr(profile.role)}</p>
                      <p>التخصص: {profile.specialty || "-"}</p>
                      <p>الجوال: {profile.mobile || "-"}</p>
                      <p>
                        حالة البلاغ الحالي:{" "}
                        {(() => {
                          const current = activeTickets.find(
                            (t) => t.assigned_technician_id === loc.user_id || t.assigned_supervisor_id === loc.user_id,
                          );
                          return current ? statusLabelAr(current.status) : "لا يوجد بلاغ نشط";
                        })()}
                      </p>
                      <p>آخر تحديث: {formatSaudiDateTime(loc.last_updated)}</p>
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
                      <p className="font-semibold">{ticket.title ?? ticket.location}</p>
                      <p>المنطقة: {zone.name}</p>
                      <p>وقت الإنشاء: {formatSaudiDateTime(ticket.created_at)}</p>
                      {ticket.closed_at ? <p>وقت الإغلاق: {formatSaudiDateTime(ticket.closed_at)}</p> : null}
                      <div className="pt-1">
                        <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabelAr(ticket.status)}</Badge>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        </MapContainer>

        <div className="absolute right-3 top-3 z-[500] max-w-[200px] rounded-md border border-slate-200 bg-white/95 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/95">
          <p className="mb-2 font-semibold text-slate-800 dark:text-slate-100">المفتاح</p>
          <div className="space-y-1.5 text-slate-700 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600" /> مدير مشروع
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-700" /> مدير مشاريع
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-900" /> مهندس
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-600" /> مراقب
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" /> فني
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-600" /> مدخل بيانات
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-600" /> لم يستلم
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" /> تم الاستلام
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" /> تم الانتهاء
            </div>
          </div>
        </div>
      </div>

      <TicketDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        ticket={selectedTicket}
        zoneName={selectedTicket?.zone_id ? zoneMap.get(selectedTicket.zone_id)?.name ?? "-" : "-"}
        onTicketUpdated={refreshTicketAfterAction}
        onMarkTicketRead={(_ticketId, _readAt) => {
          /* unread counts not shown on map */
        }}
        canViewMap
      />
    </section>
  );
}
