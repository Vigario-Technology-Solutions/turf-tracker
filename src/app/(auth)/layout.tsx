import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server-session";

/**
 * Layout for the public auth pages. If the visitor already has a valid
 * session, send them to the app — otherwise no one logs in twice.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded border border-neutral-200 bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
