import Link from "next/link";
import { requireSessionUser } from "@/lib/auth/server-session";
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
            Turf Tracker
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-600">{user.displayName ?? user.name ?? user.email}</span>
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
    </div>
  );
}
