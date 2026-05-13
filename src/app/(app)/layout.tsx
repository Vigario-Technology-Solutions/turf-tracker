import Link from "next/link";
import { requireSessionUser } from "@/lib/auth/server-session";
import { APP_NAME } from "@/lib/runtime-config";
import { SignOutButton } from "./sign-out-button";

/**
 * Auth-gated shell for every domain page. Pulls the session user
 * up-front and blocks render with a redirect if there isn't one. Top
 * bar holds the brand + identity + sign-out; nav row holds the
 * primary section links.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSessionUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold">
            {APP_NAME}
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/profile" className="text-neutral-600 hover:text-neutral-900">
              {user.displayName ?? user.name ?? user.email}
            </Link>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-4 px-4 pb-2 text-sm">
          <Link href="/" className="text-neutral-600 hover:text-neutral-900">
            What&apos;s next
          </Link>
          <Link href="/properties" className="text-neutral-600 hover:text-neutral-900">
            Properties
          </Link>
          <Link href="/products" className="text-neutral-600 hover:text-neutral-900">
            Products
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      {/* AGPL-3.0 §13 source link. Signed-in users interact with the */}
      {/* modified service over the network; this discharges the */}
      {/* obligation to prominently offer Corresponding Source. */}
      <footer className="border-t border-neutral-200 py-3 text-center font-mono text-xs text-neutral-500">
        {process.env.APP_VERSION && <>v{process.env.APP_VERSION} · </>}
        <a
          href="https://github.com/Vigario-Technology-Solutions/turf-tracker"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-neutral-900 hover:underline"
        >
          Source
        </a>
      </footer>
    </div>
  );
}
