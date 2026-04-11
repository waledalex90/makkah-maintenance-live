"use client";

import { useEffect } from "react";
import { divIcon } from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

const ZONE_MARKER_ICON = divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#16a34a;border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(15,23,42,0.25);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function MiniMapCenterController({ center }: { center: [number, number] }) {
  const map = useMapEvents({});

  useEffect(() => {
    map.setView(center, 14, { animate: true });
  }, [map, center]);

  return null;
}

function ZoneLocationPickerMap({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      onPick(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6)));
    },
  });

  return latitude !== null && longitude !== null ? (
    <Marker position={[latitude, longitude]} icon={ZONE_MARKER_ICON} />
  ) : null;
}

export type ZonePickerMapTiles = {
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom: number;
  crossOrigin?: boolean;
};

type ZonePickerMapProps = {
  center: [number, number];
  mapTiles: ZonePickerMapTiles;
  latitude: number | null;
  longitude: number | null;
  onPick: (lat: number, lng: number) => void;
};

export function ZonePickerMap({ center, mapTiles, latitude, longitude, onPick }: ZonePickerMapProps) {
  return (
    <MapContainer center={center} zoom={12} maxZoom={mapTiles.maxZoom} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution={mapTiles.attribution}
        url={mapTiles.url}
        maxZoom={mapTiles.maxZoom}
        maxNativeZoom={mapTiles.maxNativeZoom}
        crossOrigin={mapTiles.crossOrigin}
      />
      <MiniMapCenterController center={center} />
      <ZoneLocationPickerMap latitude={latitude} longitude={longitude} onPick={onPick} />
    </MapContainer>
  );
}
