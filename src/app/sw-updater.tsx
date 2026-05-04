"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Graceful SW update handoff.
 *
 * Three responsibilities:
 *
 *  1. **Trigger update checks.** Browsers (especially iOS Safari)
 *     don't aggressively poll for SW updates on their own — without
 *     a manual `registration.update()` the browser may go hours
 *     before noticing a new sw.js even with no-cache headers. We
 *     force a check on initial mount and again every time the PWA
 *     returns to the foreground.
 *
 *  2. **Handle the controller swap.** With skipWaiting + clientsClaim
 *     in sw.ts, a newly installed SW takes control immediately and
 *     fires `controllerchange`. The currently-rendered page is still
 *     running the old build's main bundle with hardcoded chunk
 *     hashes — the cache holds them, but a soft nav hits the in-
 *     memory map. Reload gracefully:
 *      - hidden tab → reload immediately (invisible)
 *      - visible tab → wait for next visibility-hidden, reload then
 *      - foreground fallback: a small "New version" banner
 *
 *  3. **Surface silent registration failures.** If /sw.js throws at
 *     evaluation time, SerwistProvider's register() promise rejects
 *     and the app keeps running — pinned to the last successful
 *     registration forever, with no updates. The default outcome is
 *     invisible rot. We check for a registration after a short
 *     grace period and log loudly if none exists.
 */
export function ServiceWorkerUpdater() {
  const [showBanner, setShowBanner] = useState(false);
  const reloaded = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Mirror SerwistProvider's `disable` flag in layout.tsx — in dev
    // the SW is intentionally never registered, so the registration
    // watchdog (responsibility #3) would fire a misleading "did not
    // register" error on every page load.
    if (process.env.NODE_ENV === "development") return;

    // Throttle visibility-foreground checks. The cold-mount check is
    // the primary update mechanism — every PWA open gets a fresh
    // check. The visibility-foreground check only matters for users
    // who keep the PWA open and tab between apps; 30 minutes is
    // plenty there.
    const FOREGROUND_CHECK_THROTTLE_MS = 30 * 60 * 1000; // 30 minutes
    let lastCheckedAt = 0;

    const doReload = () => {
      if (reloaded.current) return;
      reloaded.current = true;
      window.location.reload();
    };

    const checkForUpdate = () => {
      lastCheckedAt = Date.now();
      void navigator.serviceWorker.getRegistration().then((reg) => {
        // Forces a fresh fetch of /sw.js. If the bytes differ from
        // the installed SW, the browser kicks off install →
        // activate → controllerchange.
        reg?.update().catch(() => {
          /* offline or transient — try again on next foreground */
        });
      });
    };

    const onControllerChange = () => {
      if (document.visibilityState === "hidden") {
        doReload();
        return;
      }
      setShowBanner(true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastCheckedAt >= FOREGROUND_CHECK_THROTTLE_MS) {
          checkForUpdate();
        }
      } else if (showBanner) {
        // Pending update + user stepped away → swap silently.
        doReload();
      }
    };

    checkForUpdate();

    // Silent-registration-failure guard. 5s headroom for
    // SerwistProvider's async register() on a cold load.
    const registrationGraceTimer = setTimeout(() => {
      void navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) return;
        console.error(
          "[sw] Service worker did not register. Auto-updates disabled until this is resolved.",
        );
      });
    }, 5_000);

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(registrationGraceTimer);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [showBanner]);

  if (!showBanner) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-4 z-50 flex items-center gap-3 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
      role="status"
      aria-live="polite"
    >
      <span>New version available</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold transition-colors hover:bg-white/25"
      >
        Refresh
      </button>
    </div>
  );
}
