"use client";

import { useEffect } from "react";

/** Registers /sw.js in production so the app shell and offline page work without a connection. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Registration can fail in private browsing; the app still works online.
    });
  }, []);
  return null;
}
