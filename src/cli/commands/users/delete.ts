import type { Command } from "commander";
import prisma from "@/lib/db";
import { auditCli } from "../../shared/audit";
import { confirm } from "../../shared/prompts";

interface DeleteOpts {
  id?: string;
  email?: string;
  force?: boolean;
}

/**
 * Delete a user.
 *
 * The schema cascades Session / Account / PropertyMember rows on user
 * delete (those go cleanly), but Property.createdBy / Product.createdBy
 * / Application.appliedBy / IrrigationEvent.recordedBy do NOT cascade
 * — they're history records that shouldn't disappear when an operator
 * leaves a household.
 *
 * Pre-flight: count those references. If any exist, refuse with a
 * useful message instead of letting Postgres throw an FK violation.
 * `--force` only skips the confirm prompt; it cannot override a real
 * FK constraint and we don't pretend otherwise.
 */
export function register(program: Command): void {
  program
    .command("users:delete")
    .description("Delete a user (refuses if they own history records)")
    .option("--id <id>", "user id (cuid)")
    .option("--email <email>", "email address")
    .option("--force", "skip the confirmation prompt")
    .action(async (opts: DeleteOpts) => {
      try {
        await run(opts);
      } finally {
        await prisma.$disconnect();
      }
    });
}

async function run(opts: DeleteOpts): Promise<void> {
  const where = resolveWhere(opts);

  const user = await prisma.user.findUnique({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      displayName: true,
      _count: {
        select: {
          createdProperties: true,
          createdProducts: true,
          applications: true,
          irrigationEvents: true,
          propertyMemberships: true,
          sessions: true,
          accounts: true,
        },
      },
    },
  });

  if (!user) {
    process.stderr.write("No matching user found.\n");
    process.exit(1);
  }

  process.stderr.write(
    `Will delete: id=${user.id} email=${user.email} name="${user.displayName ?? user.name}"\n`,
  );

  const blockers = {
    properties: user._count.createdProperties,
    products: user._count.createdProducts,
    applications: user._count.applications,
    irrigationEvents: user._count.irrigationEvents,
  };
  const totalBlockers = Object.values(blockers).reduce((a, b) => a + b, 0);

  if (totalBlockers > 0) {
    process.stderr.write("Cannot delete — user owns history records that don't cascade:\n");
    for (const [kind, count] of Object.entries(blockers)) {
      if (count > 0) process.stderr.write(`  ${kind}: ${count}\n`);
    }
    process.stderr.write("Reassign ownership or delete the records first, then retry.\n");
    process.exit(1);
  }

  if (user._count.propertyMemberships > 0) {
    process.stderr.write(
      `${user._count.propertyMemberships} property membership${user._count.propertyMemberships === 1 ? "" : "s"} will cascade with the delete.\n`,
    );
  }
  if (user._count.sessions + user._count.accounts > 0) {
    process.stderr.write(
      `${user._count.sessions} session${user._count.sessions === 1 ? "" : "s"} and ${user._count.accounts} account row${user._count.accounts === 1 ? "" : "s"} (auth credentials) will cascade.\n`,
    );
  }

  if (!opts.force && !(await confirm("Proceed?"))) {
    process.stderr.write("Aborted.\n");
    return;
  }

  await prisma.user.delete({ where: { id: user.id } });
  auditCli("users:delete", {
    user_id: user.id,
    email: user.email,
    name: (user.displayName ?? user.name ?? "").replace(/\s+/g, "_") || "unknown",
  });
  process.stderr.write(`Deleted user id=${user.id}.\n`);
}

function resolveWhere(opts: DeleteOpts): { id: string } | { email: string } {
  const provided = [opts.id, opts.email].filter(Boolean).length;
  if (provided !== 1) {
    process.stderr.write("Provide exactly one of --id or --email.\n");
    process.exit(1);
  }
  if (opts.id) return { id: opts.id };
  return { email: opts.email! };
}
