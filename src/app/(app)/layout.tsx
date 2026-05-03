import { requireSessionUser } from "@/lib/auth/server-session";
import { SignOutButton } from "./sign-out-button";

/**
 * Auth-gated shell for every domain page. Pulls the session user
 * up-front and blocks render with a redirect if there isn't one. The
 * top bar exposes identity + sign-out; nav for areas/products/etc.
 * lands here once those pages exist.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSessionUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="font-semibold">Turf Tracker</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-600">{user.displayName ?? user.name ?? user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
