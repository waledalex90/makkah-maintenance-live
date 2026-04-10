"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const onLoad = function () {
        void navigator.serviceWorker.register("/sw.js");
      };
      window.addEventListener("load", onLoad);
      return () => window.removeEventListener("load", onLoad);
    }
    return undefined;
  }, []);

  return null;
}
