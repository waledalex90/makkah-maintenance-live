export function isGpsSecureContext(): boolean {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return true;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export async function ensureGpsPermission(): Promise<PermissionState | "unsupported" | "insecure"> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  if (!("geolocation" in navigator)) return "unsupported";
  if (!isGpsSecureContext()) return "insecure";
  if (!("permissions" in navigator)) return "prompt";

  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "prompt";
  }
}
