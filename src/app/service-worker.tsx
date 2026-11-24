"use client";

import { useEffect } from "react";

// Registers /sw.js so the app shell opens offline. Production only: in dev
// it would cache stale bundles.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // Cache the scripts and styles this page already loaded.
        const urls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name);
        registration.active?.postMessage({ type: "cache-static", urls });
      })
      .catch(() => {
        // Offline support is a bonus; the app works without it.
      });
  }, []);

  return null;
}

/** Tells the service worker to drop the cached home page. */
export function forgetCachedPages() {
  navigator.serviceWorker?.controller?.postMessage({ type: "sign-out" });
}
