import { divIcon } from "leaflet";

export function escapeHtmlMapLabel(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Label above pin (always visible while marker is on map); lat/lng at bottom center of marker */
export function fleetMarkerIcon(color: string, displayName: string) {
  const label = escapeHtmlMapLabel(displayName.trim() || "—");
  return divIcon({
    className: "fleet-marker-root",
    html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;transform:translateY(-4px)">
      <span style="font-size:12px;font-weight:600;line-height:1.3;max-width:200px;background:#fff;color:#0f172a;padding:4px 10px;border-radius:9999px;border:1px solid #cbd5e1;box-shadow:0 2px 6px rgba(0,0,0,0.15);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</span>
      <span style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid #cbd5e1;margin-top:1px"></span>
      <span style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,0.25);margin-top:2px"></span>
    </div>`,
    iconSize: [156, 44],
    iconAnchor: [78, 44],
    popupAnchor: [0, -44],
  });
}

/** دبوس دائري فقط — التسمية تُعرض عبر Tooltip ثابت (Static Tooltip) */
export function fleetPinDotOnly(color: string) {
  return divIcon({
    className: "fleet-pin-dot",
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,0.3);"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}
