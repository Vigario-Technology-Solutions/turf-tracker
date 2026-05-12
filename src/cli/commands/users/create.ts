import type { Command } from "commander";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { validatePassword } from "@/lib/auth/password-policy";
import { confirm, password, text } from "../../shared/prompts";

export interface CreateUserOpts {
  email?: string;
  name?: string;
  displayName?: string;
  password?: string;
  /** Skip email-verified flag (default: true). */
  unverified?: boolean;
}

/**
 * Create a User + a credential Account row in a single transaction.
 * Mirrors what better-auth's `signUp.email` does internally — the
 * adapter writes both rows on signup; we replicate that shape so the
 * created user can sign in via the web UI immediately.
 *
 * Roles in turf-tracker are per-property (PropertyMember.role) so
 * there's no role flag here. Properties can be assigned via a future
 * `properties:add-member` command.
 */
export function register(program: Command): void {
  program
    .command("users:create")
    .description("Create a user with an email + password (mirrors web signup)")
    .option("--email <email>", "email address")
    .option("--name <name>", "full name")
    .option("--display-name <name>", "display name (defaults to --name)")
    .option("--password <password>", "password (prompted if omitted)")
    .option("--unverified", "create with emailVerified=false (default: verified)")
    .action(async (opts: CreateUserOpts) => {
      try {
        await createUser(opts);
      } finally {
        await prisma.$disconnect();
      }
    });
}

/**
 * Run the interactive user-creation flow. Exported for direct
 * invocation from other commands that need to create a user without
 * spawning the CLI wrapper. Caller is responsible for
 * `prisma.$disconnect()`.
 *
 * (Note: `turf setup`'s first-user prompt deliberately does NOT call
 * this in-process — on first install the in-process Prisma client
 * was init'd against an empty `/etc/sysconfig` env, so it can't
 * reach the DB. Setup spawns `/usr/bin/turf users:create` instead so
 * the wrapper re-sources the sysconfig that setup just wrote.)
 */
export async function createUser(opts: CreateUserOpts): Promise<void> {
  const email = opts.email ?? (await text("Email", { validate: emailLike }));
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new Error(`A user with email "${email}" already exists.`);
  }

  const name = opts.name ?? (await text("Full name", { validate: nonEmpty }));
  const displayName =
    opts.displayName ?? (await text("Display name", { default: name, validate: nonEmpty }));

  const pwd = opts.password ?? (await password("Password"));
  const policy = validatePassword(pwd);
  if (!policy.valid) {
    process.stderr.write(`Password does not meet policy: ${policy.error ?? ""}\n`);
    if (!(await confirm("Continue anyway?"))) {
      process.stderr.write("Aborted.\n");
      process.exit(1);
    }
  }

  const hash = await hashPassword(pwd);

  // Single transaction: User + credential Account land together so a
  // half-created user can never get stuck with no way to sign in.
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        name,
        displayName,
        emailVerified: !opts.unverified,
      },
    });
    await tx.account.create({
      data: {
        userId: u.id,
        // Better-Auth's prisma adapter keys the credential account by
        // the user's email (matches signUp.email's behaviour).
        accountId: email,
        providerId: "credential",
        password: hash,
      },
    });
    return u;
  });

  process.stderr.write(`Created user id=${user.id} email=${email}\n`);
}

function nonEmpty(value: string): string | null {
  return value.trim() ? null : "Required.";
}

function emailLike(value: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : "Doesn't look like an email.";
}
