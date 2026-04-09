"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

const TRACK_INTERVAL_MS = 60_000;

export function LiveLocationTracker() {
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    const trackLocation = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        const role = profile?.role as string | undefined;
        if (!role || !["technician", "supervisor", "engineer"].includes(role)) return;

        if (!navigator.geolocation) return;
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10_000,
            maximumAge: 30_000,
          }),
        );

        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        const nowIso = new Date().toISOString();

        await supabase.from("live_locations").upsert({ user_id: user.id, latitude, longitude });
        await supabase
          .from("profiles")
          .update({
            current_latitude: latitude,
            current_longitude: longitude,
            last_location_at: nowIso,
          })
          .eq("id", user.id);
      } catch {
        // Ignore geolocation errors to avoid interrupting user flow.
      } finally {
        runningRef.current = false;
      }
    };

    void trackLocation();
    timerRef.current = window.setInterval(() => {
      void trackLocation();
    }, TRACK_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) {
        void trackLocation();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  return null;
}
