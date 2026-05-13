import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server-session";
import { APP_NAME, APP_OWNER } from "@/lib/runtime-config";

/**
 * Layout for the public auth pages. If the visitor already has a valid
 * session, send them to the app — otherwise no one logs in twice.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
      {/* Branding chrome — APP_NAME is the canonical title; APP_OWNER */}
      {/* (operator company) is the subtitle, omitted entirely when unset. */}
      <div className="mb-4 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">{APP_NAME}</h1>
        {APP_OWNER && <p className="mt-0.5 text-sm text-neutral-600">{APP_OWNER}</p>}
      </div>
      <div className="w-full max-w-sm rounded border border-neutral-200 bg-white p-6 shadow-sm">
        {children}
      </div>
      {/* AGPL-3.0 §13 source link. Anyone hitting the public URL */}
      {/* without a session lands here first, so this is the load- */}
      {/* bearing surface for discharging the §13 obligation to */}
      {/* offer Corresponding Source to network-interacting users. */}
      <p className="mt-4 font-mono text-xs text-neutral-500">
        {process.env.APP_VERSION && <>v{process.env.APP_VERSION} · </>}
        <a
          href="https://github.com/Vigario-Technology-Solutions/turf-tracker"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-neutral-900 hover:underline"
        >
          Source
        </a>
      </p>
    </div>
  );
}
