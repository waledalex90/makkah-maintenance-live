"use client";

import { useEffect } from "react";
import { divIcon } from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";

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

function dotIcon(color: string, label: string) {
  const safeLabel = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;transform:translateY(-8px)">
      <span style="font-size:11px;background:#fff;padding:2px 6px;border-radius:9999px;border:1px solid #e2e8f0;white-space:nowrap;">${safeLabel}</span>
      <span style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,0.25);"></span>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function TicketDetailLiveMap({ focusPoint, staffPins, ticketLabel }: TicketDetailLiveMapProps) {
  return (
    <div className="relative h-72 overflow-hidden rounded-xl border border-slate-200">
      <MapContainer center={focusPoint} zoom={14} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FocusOnPoint point={focusPoint} />
        <Marker position={focusPoint} icon={dotIcon("#0f172a", ticketLabel)}>
          <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent>
            موقع البلاغ
          </Tooltip>
        </Marker>
        {staffPins.map((pin) => {
          const color = pin.status === "busy" ? "#dc2626" : pin.status === "offline" ? "#9ca3af" : "#16a34a";
          return (
            <Marker key={pin.user_id} position={[pin.latitude, pin.longitude]} icon={dotIcon(color, pin.full_name)}>
              <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                {pin.full_name} - {pin.role} - {pin.status === "busy" ? "مشغول" : pin.status === "offline" ? "غير متصل" : "متاح"}
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
