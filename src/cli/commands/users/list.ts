import type { Command } from "commander";
import prisma from "@/lib/db";
import { table } from "../../shared/prompts";

interface ListOpts {
  json?: boolean;
}

export function register(program: Command): void {
  program
    .command("users:list")
    .description("List all users with their property-membership counts")
    .option("--json", "output as JSON instead of a table")
    .action(async (opts: ListOpts) => {
      try {
        await run(opts);
      } finally {
        await prisma.$disconnect();
      }
    });
}

async function run(opts: ListOpts): Promise<void> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      displayName: true,
      emailVerified: true,
      createdAt: true,
      _count: {
        select: { propertyMemberships: true, createdProperties: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(users, null, 2) + "\n");
    return;
  }

  if (users.length === 0) {
    process.stderr.write("No users found.\n");
    return;
  }

  const rows = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.displayName ?? u.name,
    verified: u.emailVerified ? "yes" : "no",
    properties: String(u._count.propertyMemberships),
    created: u.createdAt.toISOString().slice(0, 10),
  }));

  process.stdout.write(table(rows) + "\n");
  process.stderr.write(`\n${users.length} user${users.length === 1 ? "" : "s"}.\n`);
}
