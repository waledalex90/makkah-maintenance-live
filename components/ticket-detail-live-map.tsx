"use client";

import { useEffect } from "react";
import { divIcon } from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { fleetPinDotOnly } from "@/lib/map-fleet-marker";
import { getLeafletTileProps } from "@/lib/maptiler";

type StaffPin = {
  user_id: string;
  full_name: string;
  role: string;
  status: "available" | "busy" | "offline";
  latitude: number;
  longitude: number;
};

type TicketDetailLiveMapProps = {
  focusPoint: [number, number];
  staffPins: StaffPin[];
  ticketLabel: string;
};

function FocusOnPoint({ point }: { point: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(point, 14, { animate: true });
  }, [map, point]);
  return null;
}

function ticketDotIcon(color: string, label: string) {
  const safeLabel = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
      <span style="font-size:12px;font-weight:600;background:#fff;color:#0f172a;padding:4px 10px;border-radius:9999px;border:1px solid #cbd5e1;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${safeLabel}</span>
      <span style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #fff;margin-top:4px;box-shadow:0 0 0 1px rgba(15,23,42,0.25);"></span>
    </div>`,
    iconSize: [160, 44],
    iconAnchor: [80, 44],
  });
}

function staffPinColor(pin: StaffPin): string {
  if (pin.status === "busy") return "#dc2626";
  if (pin.status === "offline") return "#9ca3af";
  return "#16a34a";
}

export function TicketDetailLiveMap({ focusPoint, staffPins, ticketLabel }: TicketDetailLiveMapProps) {
  const streetsTile = getLeafletTileProps();

  return (
    <div className="relative h-72 overflow-hidden rounded-xl border border-slate-200">
      <MapContainer center={focusPoint} zoom={14} maxZoom={streetsTile.maxZoom} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution={streetsTile.attribution}
          url={streetsTile.url}
          maxZoom={streetsTile.maxZoom}
          maxNativeZoom={streetsTile.maxNativeZoom}
          crossOrigin={streetsTile.crossOrigin}
        />
        <FocusOnPoint point={focusPoint} />
        <Marker position={focusPoint} icon={ticketDotIcon("#0f172a", ticketLabel)} />
        {staffPins.map((pin) => {
          const color = staffPinColor(pin);
          const displayName = pin.full_name.trim() || "—";
          return (
            <Marker key={pin.user_id} position={[pin.latitude, pin.longitude]} icon={fleetPinDotOnly(color)}>
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
  );
}
