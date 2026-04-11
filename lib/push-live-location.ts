import { ensureGpsPermission } from "@/lib/gps-permission";
import { supabase } from "@/lib/supabase";

/** يرسل موقع الجهاز الحالي إلى live_locations وprofiles (للتتبع بعد الاستلام). */
export async function pushLiveLocationOnce(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return false;

  const permission = await ensureGpsPermission();
  if (permission === "unsupported" || permission === "insecure" || permission === "denied") {
    return false;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        const nowIso = new Date().toISOString();
        await Promise.all([
          supabase.from("live_locations").upsert({
            user_id: user.id,
            latitude,
            longitude,
            last_updated: nowIso,
          }),
          supabase
            .from("profiles")
            .update({
              current_latitude: latitude,
              current_longitude: longitude,
              last_location_at: nowIso,
              availability_status: "busy",
            })
            .eq("id", user.id),
        ]);
        resolve(true);
      },
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}
