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
 * اللغة العربية على البلاطات Raster: لا يوجد في وثائق MapTiler معامل `language` يغيّر نصوص الـ PNG؛
 * التسميات تعتمد على ستايل الخريطة وبيانات OSM (غالباً أسماء محلية + لاتينية في مكة).
 * لخريطة عربية بالكامل: أنشئ ستايلاً مخصصاً في MapTiler Cloud وحدّد `NEXT_PUBLIC_MAPTILER_STREETS_MAP_ID`.
 *
 * @see https://docs.maptiler.com/cloud/api/
 */

export const MAPTILER_ATTRIBUTION =
  '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

export function getMapTilerApiKey(): string {
  if (typeof process === "undefined") return "";
  const raw = process.env.NEXT_PUBLIC_MAPTILER_API_KEY ?? "";
  return raw.trim();
}

/**
 * شوارع MapTiler — يجب تضمين حجم البلاطة `/256/` في المسار (وثائق Maps API).
 * الصيغة: `https://api.maptiler.com/maps/{mapId}/256/{z}/{x}/{y}.png?key=…`
 * بدون `/256/` قد تظهر خريطة شبه فارغة أو بلا تسميات.
 * @see https://docs.maptiler.com/cloud/api/maps/#raster-xyz-tiles
 * @see https://docs.maptiler.com/leaflet/examples/raster-tiles-in-leaflet-js/
 */
const DEFAULT_STREETS_MAP_ID = "streets-v4";

export function getMapTilerStreetsMapId(): string {
  if (typeof process === "undefined") return DEFAULT_STREETS_MAP_ID;
  const id = process.env.NEXT_PUBLIC_MAPTILER_STREETS_MAP_ID?.trim();
  return id || DEFAULT_STREETS_MAP_ID;
}

export function mapTilerStreetsTileUrl(key: string): string {
  const k = encodeURIComponent(key);
  const mapId = getMapTilerStreetsMapId();
  return `https://api.maptiler.com/maps/${mapId}/256/{z}/{x}/{y}.png?key=${k}`;
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
  /** MapTiler يوصي بها لـ Leaflet مع بلاطات CDN */
  crossOrigin?: boolean;
} {
  const key = getMapTilerApiKey();
  if (key) {
    return {
      url: mapTilerStreetsTileUrl(key),
      attribution: MAPTILER_ATTRIBUTION,
      maxZoom: 22,
      maxNativeZoom: 22,
      crossOrigin: true,
    };
  }
  return {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    maxNativeZoom: 19,
  };
}
