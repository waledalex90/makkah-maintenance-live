/**
 * MapTiler raster tiles (Leaflet: {z} {x} {y}).
 * كل مكوّنات الخريطة تستخدم هذا الملف فقط — لا تكرار لروابط الـ tiles في المشروع.
 *
 * - الشوارع: `mapTilerStreetsTileUrl` / `getLeafletTileProps()` → `?key=…`
 * - الأقمار (طبقة اختيارية): `mapTilerSatelliteTileUrl(key)` → `?key=…`
 *
 * المستهلكون: `operations-map`, `live-radar-map`, `ticket-detail-live-map`, `zones-management`.
 * عيّن `NEXT_PUBLIC_MAPTILER_API_KEY` في `.env.local` حتى يُضمَّن المفتاح في الـ URL (وإلا يُستخدم OSM احتياطياً).
 *
 * @see https://docs.maptiler.com/cloud/api/
 */

export const MAPTILER_ATTRIBUTION =
  '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

export function getMapTilerApiKey(): string {
  const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MAPTILER_API_KEY ?? "" : "";
  return raw.trim();
}

/** Streets v2 (default operational basemap) */
export function mapTilerStreetsTileUrl(key: string): string {
  return `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`;
}

/** Satellite imagery (optional second basemap) */
export function mapTilerSatelliteTileUrl(key: string): string {
  return `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${encodeURIComponent(key)}`;
}

export function getLeafletTileProps(): {
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom: number;
} {
  const key = getMapTilerApiKey();
  if (key) {
    return {
      url: mapTilerStreetsTileUrl(key),
      attribution: MAPTILER_ATTRIBUTION,
      maxZoom: 22,
      maxNativeZoom: 22,
    };
  }
  return {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    maxNativeZoom: 19,
  };
}
