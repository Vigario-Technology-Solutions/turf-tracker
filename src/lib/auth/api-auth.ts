import "server-only";
import { auth } from "./server";

/**
 * API-route auth context.
 *
 * Phase 1 is session-only — every authenticated request comes from a
 * logged-in user. Service tokens (programmatic ingestion, automation)
 * land later when we have an actual non-web caller; until then there's
 * no point shipping the surface.
 *
 * Roles in turf-tracker are PER-PROPERTY (PropertyMember.role:
 * owner / contributor / viewer), not user-level — so `ApiContext`
 * deliberately does not carry a global role. Per-resource
 * authorization happens in `./guards.ts`.
 */
export interface ApiContext {
  source: "session";
  userId: string;
}

/**
 * Resolve the auth context for an API request. Returns null when
 * there's no valid session — callers respond with `unauthorized()`.
 *
 * `auth.api.getSession` reads the session cookie from the headers; we
 * just hand it the request's headers and let Better-Auth do the work.
 */
export async function getApiContext(request: Request): Promise<ApiContext | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return { source: "session", userId: session.user.id };
}
