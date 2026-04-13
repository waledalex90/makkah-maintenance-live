"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    // Temporary hard-disable SW runtime to avoid stale route/chunk failures.
    // We can re-enable registration after stabilizing navigation behavior.
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });

    if ("caches" in window) {
      void caches.keys().then((keys) => {
        keys.forEach((key) => {
          void caches.delete(key);
        });
      });
    }
  }, []);

  return null;
}
