import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

/**
 * Read the Better-Auth session from request headers and return the user
 * shape (with our domain extensions: displayName, defaultPropertyId,
 * unitSystem, currency). Returns null if no valid session — callers
 * decide whether to redirect.
 */
export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * Same as `getSessionUser` but redirects to /sign-in when no session is
 * present, narrowing the return type for downstream code.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
