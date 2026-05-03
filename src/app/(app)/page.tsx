import { requireSessionUser } from "@/lib/auth/server-session";

/**
 * Phase 1 placeholder home. Becomes the "What's Next?" view (per area,
 * top-ranked recommended actions) once the rules engine lands. For now
 * it exists so the auth-gated shell has a target page after sign-in.
 */
export default async function Home() {
  const user = await requireSessionUser();

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">What&apos;s next?</h1>
      <p className="text-sm text-neutral-600">
        Signed in as <strong>{user.email}</strong>. The recommendation engine and area picker land
        in Phase 2 — see <code>docs/SPEC.md</code>.
      </p>
    </div>
  );
}
