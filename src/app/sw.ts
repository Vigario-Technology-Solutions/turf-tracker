import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Runtime caching strategy.
 *
 * Inherits @serwist/next's defaultCache for most rules, but overrides
 * the `_next/static/**` rules because the defaults are too conservative
 * for any real App Router project: 64 entries / 1 day means the LRU
 * evicts route chunks the currently-running page still references,
 * then a client-side navigation hits a 404 on a content-hashed URL
 * and silently fails. Hashes are immutable so we can safely cache
 * effectively forever and raise the cap high enough to hold the whole
 * route graph. The ServiceWorkerUpdater catches the rare "SW took
 * over with a newer build" case by reloading on controllerchange.
 */
const IMMUTABLE_MAX_ENTRIES = 512;
const IMMUTABLE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days

const nextStaticJs: RuntimeCaching = {
  matcher: /\/_next\/static\/.+\.js$/i,
  handler: new CacheFirst({
    cacheName: "next-static-js-assets",
    plugins: [
      new ExpirationPlugin({
        maxEntries: IMMUTABLE_MAX_ENTRIES,
        maxAgeSeconds: IMMUTABLE_MAX_AGE_SECONDS,
        maxAgeFrom: "last-used",
      }),
    ],
  }),
};

const nextStaticCss: RuntimeCaching = {
  matcher: /\/_next\/static\/.+\.css$/i,
  handler: new CacheFirst({
    cacheName: "next-static-css-assets",
    plugins: [
      new ExpirationPlugin({
        maxEntries: IMMUTABLE_MAX_ENTRIES,
        maxAgeSeconds: IMMUTABLE_MAX_AGE_SECONDS,
        maxAgeFrom: "last-used",
      }),
    ],
  }),
};

// Overrides come BEFORE defaultCache so first-match-wins picks them.
// Strip defaultCache's _next/static rule so it doesn't double-handle.
const runtimeCaching: RuntimeCaching[] = [
  nextStaticJs,
  nextStaticCss,
  ...defaultCache.filter((rule) => {
    const src = rule.matcher.toString();
    if (src.includes("_next") && src.includes("static")) return false;
    return true;
  }),
];

// Skip precache in dev. The manifest snapshots chunk hashes at SW
// build, but HMR invalidates them seconds later — install then fires
// `bad-precaching-response: status 404` for chunks the dev server has
// already replaced. Hostname check rather than NODE_ENV because
// serwist build runs the bundler with NODE_ENV defaulted to
// "production" regardless of intent — `process.env.NODE_ENV` would
// constant-fold to false. Hostname is read at runtime, can't be
// folded.
const isDev = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

const serwist = new Serwist({
  precacheEntries: isDev ? [] : self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        // Only fall back on real navigations when actually offline.
        // Matching every document request bounces users to the
        // offline page on transient fetch hiccups during normal use.
        matcher({ request }) {
          return request.mode === "navigate" && !self.navigator.onLine;
        },
      },
    ],
  },
});

serwist.addEventListeners();
