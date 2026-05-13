import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline",
};

/**
 * Served by the SW's `fallbacks` rule when a real navigation fails
 * because the device is offline. Static — no data fetches, no auth
 * dependency — so it always renders even with no network at all.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-200">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-8 w-8 text-neutral-500"
            aria-hidden
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="mt-2 text-sm text-neutral-600">
          The page you tried to open hasn&apos;t been cached yet. Reconnect and try again — anything
          you logged earlier is safe.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-white"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
