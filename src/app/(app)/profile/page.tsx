import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Profile" };

/**
 * Profile editor. Two independent cards on one page:
 *   - identity: name / displayName / defaultProperty / unitSystem
 *   - password: change-password (requires current pw + new + confirm)
 *
 * Email is intentionally read-only here — changing it needs a separate
 * verification flow (see SPEC §8.3) we haven't built yet.
 */
export default async function ProfilePage() {
  const user = await requireSessionUser();

  const memberships = await prisma.propertyMember.findMany({
    where: { userId: user.id },
    select: { property: { select: { id: true, name: true } } },
    orderBy: { property: { name: "asc" } },
  });
  const properties = memberships.map((m) => m.property);

  return (
    <div className="max-w-md space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Signed in as <span className="font-mono">{user.email}</span>.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Identity</h2>
        <ProfileForm
          properties={properties}
          defaultValues={{
            name: user.name ?? "",
            displayName: user.displayName ?? "",
            defaultPropertyId: user.defaultPropertyId ?? "",
            unitSystem: user.unitSystem === "metric" ? "metric" : "imperial",
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Password</h2>
        <p className="text-sm text-neutral-600">
          Changing your password signs you out of every other device.
        </p>
        <PasswordForm />
      </section>
    </div>
  );
}
