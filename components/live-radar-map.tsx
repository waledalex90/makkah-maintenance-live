"use client";

import { useEffect, useMemo, useState } from "react";
import { LatLngBounds, latLng } from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { toast } from "sonner";
import { isFleetMapRole } from "@/lib/fleet-map-roles";
import { fleetPinDotOnly } from "@/lib/map-fleet-marker";
import { getLeafletTileProps } from "@/lib/maptiler";
import { supabase } from "@/lib/supabase";
import type { TicketStatus } from "@/lib/ticket-status";

type ZoneRow = {
  id: string;
  name: string;
  center_latitude?: number | null;
  center_longitude?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

type TicketRow = {
  id: string;
  zone_id: string | null;
  status: TicketStatus;
};

type ProfileJoin = {
  full_name: string;
  role: "admin" | "engineer" | "supervisor" | "technician" | "reporter" | "project_manager" | "projects_director";
};

type LiveLocationRow = {
  user_id: string;
  latitude: number;
  longitude: number;
  last_updated: string;
  profiles?: ProfileJoin | ProfileJoin[] | null;
};

type LiveRadarMapProps = {
  zoneFilter: string;
};

const MAKKAH_CENTER: [number, number] = [21.4225, 39.8262];
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const ZONE_RADIUS_METERS = 2500;

function normalizeProfile(profile: LiveLocationRow["profiles"]): ProfileJoin | null {
  if (!profile) return null;
  if (Array.isArray(profile)) return profile[0] ?? null;
  return profile;
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

function roleFleetColor(role: string): string {
  if (role === "technician") return "#2563eb";
  if (role === "supervisor") return "#7c3aed";
  if (role === "engineer") return "#0f172a";
  if (role === "reporter") return "#ea580c";
  if (role === "project_manager") return "#0891b2";
  if (role === "projects_director") return "#be123c";
  return "#64748b";
}

function FitMapBounds({ points }: { points: Array<[number, number]> }) {
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

export function LiveRadarMap({ zoneFilter }: LiveRadarMapProps) {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [liveLocations, setLiveLocations] = useState<LiveLocationRow[]>([]);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [mapError, setMapError] = useState<string | null>(null);
  const streetsTile = getLeafletTileProps();

  const zoneMap = useMemo(() => {
    const map = new Map<string, ZoneRow>();
    zones.forEach((zone) => map.set(zone.id, zone));
    return map;
  }, [zones]);

  const selectedZoneCenter = useMemo(() => {
    if (zoneFilter === "all") return null;
    const zone = zoneMap.get(zoneFilter);
    if (!zone) return null;
    const lat = zone.center_latitude ?? zone.latitude ?? null;
    const lng = zone.center_longitude ?? zone.longitude ?? null;
    return lat !== null && lng !== null ? ([lat, lng] as [number, number]) : null;
  }, [zoneFilter, zoneMap]);

  const busyUserIds = useMemo(() => {
    const ids = new Set<string>();
    tickets.forEach((ticket) => {
      if (ticket.status !== "finished") {
        // Busy state is inferred by any active ticket in selected zone scope.
        // User-level assignment is shown in details table.
      }
    });
    return ids;
  }, [tickets]);

  const visibleFleet = useMemo(() => {
    if (zoneFilter === "all") return liveLocations;
    if (!selectedZoneCenter) return [];
    return liveLocations.filter((loc) => distanceMeters(loc.latitude, loc.longitude, selectedZoneCenter[0], selectedZoneCenter[1]) <= ZONE_RADIUS_METERS);
  }, [liveLocations, zoneFilter, selectedZoneCenter]);

  const mapPoints = useMemo(() => {
    const points: Array<[number, number]> = visibleFleet.map((loc) => [loc.latitude, loc.longitude]);
    if (selectedZoneCenter) points.push(selectedZoneCenter);
    return points.length > 0 ? points : [MAKKAH_CENTER];
  }, [visibleFleet, selectedZoneCenter]);

  const loadMapData = async () => {
    const [zonesRes, ticketsRes, liveRes] = await Promise.all([
      supabase.from("zones").select("id, name, center_latitude, center_longitude, latitude, longitude").order("name"),
      supabase.from("tickets").select("id, zone_id, status"),
      supabase.from("live_locations").select("user_id, latitude, longitude, last_updated, profiles(full_name, role)"),
    ]);

    if (zonesRes.error || ticketsRes.error || liveRes.error) {
      const message = zonesRes.error?.message || ticketsRes.error?.message || liveRes.error?.message || "تعذر تحميل الخريطة.";
      setMapError(message);
      toast.error(`تنبيه الخريطة: ${message}`);
      return;
    }

    setMapError(null);
    setZones((zonesRes.data as ZoneRow[]) ?? []);
    const zoneScopedTickets = ((ticketsRes.data as TicketRow[]) ?? []).filter((t) => (zoneFilter === "all" ? true : t.zone_id === zoneFilter));
    setTickets(zoneScopedTickets);
    const staff = ((liveRes.data as LiveLocationRow[]) ?? []).filter((row) => {
      const profile = normalizeProfile(row.profiles);
      return Boolean(profile && isFleetMapRole(profile.role));
    });
    setLiveLocations(staff);
  };

  useEffect(() => {
    void loadMapData();
  }, [zoneFilter]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("live-radar-map-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_locations" }, () => void loadMapData())
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => void loadMapData())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [zoneFilter]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">الخريطة الحية (Live Radar)</h2>
        <p className="text-xs text-slate-500">تظهر مباشرة أمام المدير مع تحديث لحظي</p>
      </div>
      {mapError ? (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          تنبيه: {mapError}
        </div>
      ) : null}
      <div className="relative h-[48vh] overflow-hidden rounded-lg border border-slate-200">
        <MapContainer center={MAKKAH_CENTER} zoom={11} maxZoom={streetsTile.maxZoom} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution={streetsTile.attribution}
            url={streetsTile.url}
            maxZoom={streetsTile.maxZoom}
            maxNativeZoom={streetsTile.maxNativeZoom}
            crossOrigin={streetsTile.crossOrigin}
          />
          <FitMapBounds points={mapPoints} />
          {visibleFleet.map((loc) => {
            const profile = normalizeProfile(loc.profiles);
            if (!profile) return null;
            const isOnline = nowTs - new Date(loc.last_updated).getTime() <= ONLINE_WINDOW_MS;
            const base = roleFleetColor(profile.role);
            const color = !isOnline ? "#9ca3af" : busyUserIds.has(loc.user_id) ? "#dc2626" : base;
            const displayName = profile.full_name.trim() || "—";
            return (
              <Marker
                key={loc.user_id}
                position={[loc.latitude, loc.longitude]}
                icon={fleetPinDotOnly(color)}
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
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </section>
  );
}
