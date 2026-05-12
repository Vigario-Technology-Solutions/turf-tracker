import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import prisma from "@/lib/db";
import { confirm, text } from "../../shared/prompts";
import { systemctlIsActive, systemctlRun } from "../../shared/systemctl";

/**
 * First-time environment bootstrap.
 *
 * Two operating modes, auto-detected from the host:
 *
 *   - **RPM host** (the canonical RPM ships
 *     `/usr/lib/turf-tracker/default.env`). Template defaults to that
 *     path, output defaults to `/etc/sysconfig/turf-tracker` at 0o600,
 *     and after writing the env file the command offers to run
 *     `systemctl start turf-tracker-migrate`, `turf-tracker-seed`, then
 *     `enable --now turf-tracker.service` so first-install setup is a
 *     single command. Requires root.
 *
 *   - **Dev host** (no RPM template). Template defaults to
 *     `./.env.example`, output defaults to stdout. No systemctl
 *     orchestration — the operator wires the result into their dev
 *     workflow themselves.
 *
 * Explicit `--template` / `--output` overrides the auto-detection in
 * either mode.
 *
 * Resolution logic per-key in the template:
 *
 *   - If KEY is in SECRET_KEYS, auto-generate a fresh 32-byte hex
 *     secret. Operators never see or copy-paste these.
 *   - If VALUE contains `your-` or `generate-with` placeholders,
 *     prompt for a real value.
 *   - If VALUE is empty and KEY is required, prompt.
 *   - Otherwise VALUE is a concrete default; offer it as the prompt
 *     default (operator presses enter to accept).
 *
 * Commented-out `# KEY=value` lines are left alone — those are
 * optional / example-only vars that the operator can fill in later.
 *
 * Re-running setup on an existing env file is idempotent and supports
 * audit + edit:
 *
 *   - Non-secret keys with an existing value get prompted with the
 *     existing value as the default. Operator presses enter to keep,
 *     types to change. Lets the operator audit current config (see
 *     what's set) and rotate specific values without editing the file
 *     by hand or losing other state.
 *   - Secret keys (auto-generated 32-byte hex) are NEVER auto-rotated
 *     on re-run and their existing values are NEVER shown in the
 *     prompt (would leak through terminal scrollback / shell history).
 *     Preserved silently and reported in a summary line. Pass
 *     `--rotate` to regenerate every secret key.
 *   - Newly-introduced keys since the file was last written get
 *     prompted normally — re-running after a release that adds a new
 *     required var just asks about the new one.
 *
 * `--non-interactive` fails fast if any prompt would be needed (for
 * ansible / automation). On RPM hosts it also skips the systemctl
 * orchestration prompt and prints the equivalent commands instead.
 */

const RPM_TEMPLATE_PATH = "/usr/lib/turf-tracker/default.env";
const RPM_SYSCONFIG_PATH = "/etc/sysconfig/turf-tracker";

// Keys that get auto-generated crypto secrets. Explicit list over
// heuristics so a future key named like FOO_SECRET_KEY isn't silently
// given a random value when the operator meant to paste an API key.
const SECRET_KEYS = new Set(["BETTER_AUTH_SECRET", "AUTH_PASSWORD_PEPPER"]);

// Template values that indicate "operator needs to fill this in."
// Match the conventions in .env.example.
const PLACEHOLDER_PATTERNS = [/your-/, /generate-with/];

interface SetupOpts {
  output?: string;
  template?: string;
  nonInteractive?: boolean;
  rotate?: boolean;
}

export function register(program: Command): void {
  program
    .command("setup")
    .description("Generate or update the environment file for a first-time or incremental deploy")
    .option("--output <path>", "write to this file instead of the auto-detected default")
    .option("--template <path>", "use this template instead of the auto-detected default")
    .option("--rotate", "regenerate auto-generated secrets even if they're already set")
    .option(
      "--non-interactive",
      "fail if any prompt would be required; skip systemctl orchestration",
    )
    .action(async (opts: SetupOpts) => {
      await run(opts);
    });
}

interface TemplateEntry {
  key: string;
  value: string;
}

function parseTemplate(src: string): TemplateEntry[] {
  const entries: TemplateEntry[] = [];
  for (const line of src.split(/\r?\n/)) {
    // Skip blank lines + commented-out optional vars
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) continue;
    entries.push({ key: match[1], value: match[2] });
  }
  return entries;
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

function hex(): string {
  return randomBytes(32).toString("hex");
}

function formatEnvFile(entries: TemplateEntry[]): string {
  // KEY=value lines, newline-terminated. Matches systemd
  // EnvironmentFile format (which is also .env-compatible).
  return entries.map((e) => `${e.key}=${e.value}`).join("\n") + "\n";
}

async function run(opts: SetupOpts): Promise<void> {
  const isRpmHost = existsSync(RPM_TEMPLATE_PATH);
  // Snapshotted BEFORE we write anything. Determines whether this is
  // first install (no sysconfig yet) vs re-run on an established
  // deploy. Load-bearing for the user-creation gate at the end:
  // shouldOfferUserCreation()'s `prisma.user.count()` can't reach the
  // DB on first install because the in-process Prisma client was
  // initialized at module load with the empty default.env env (the
  // wrapper sourced default.env + the nonexistent sysconfig, so
  // DATABASE_URL is ""). Tracking the pre-write state lets us
  // unconditional-offer in that case.
  const sysconfigExistedAtStart = existsSync(RPM_SYSCONFIG_PATH);

  const templatePath = opts.template
    ? resolve(opts.template)
    : isRpmHost
      ? RPM_TEMPLATE_PATH
      : resolve(".env.example");
  if (!existsSync(templatePath)) {
    process.stderr.write(`✗ Template not found at ${templatePath}\n`);
    process.exit(1);
  }
  const template = parseTemplate(readFileSync(templatePath, "utf8"));

  // Output destination. Explicit --output wins. `--output -` forces
  // stdout (standard UNIX convention) — useful on RPM hosts when the
  // operator wants to preview the env file before writing it. Otherwise
  // infer from RPM-host detection; otherwise undefined (stdout).
  const outPath =
    opts.output === "-" ? undefined : (opts.output ?? (isRpmHost ? RPM_SYSCONFIG_PATH : undefined));

  // Read existing output file for idempotent merge.
  const existingByKey = new Map<string, string>();
  if (outPath && existsSync(outPath)) {
    for (const entry of parseTemplate(readFileSync(outPath, "utf8"))) {
      existingByKey.set(entry.key, entry.value);
    }
  }

  const resolved: TemplateEntry[] = [];
  const generatedSecrets: string[] = [];
  const preservedSecrets: string[] = [];
  const prompted: string[] = [];

  for (const entry of template) {
    const existing = existingByKey.get(entry.key);
    const hasExisting = existing !== undefined && existing !== "" && !isPlaceholder(existing);

    // Secrets: never display in prompts (would leak through terminal
    // scrollback / shell history), never auto-rotate. --rotate is the
    // only path to regenerate.
    if (SECRET_KEYS.has(entry.key)) {
      if (hasExisting && !opts.rotate) {
        resolved.push({ key: entry.key, value: existing });
        preservedSecrets.push(entry.key);
        continue;
      }
      resolved.push({ key: entry.key, value: hex() });
      generatedSecrets.push(entry.key);
      continue;
    }

    // Non-secret with existing value: prompt with existing as default.
    // Operator presses enter to keep, types to change. The existing
    // value is visible in the prompt — fine for non-secrets, and the
    // audit affordance is the point.
    if (hasExisting) {
      if (opts.nonInteractive) {
        resolved.push({ key: entry.key, value: existing });
        continue;
      }
      const answer = await text(entry.key, { default: existing });
      resolved.push({ key: entry.key, value: answer });
      if (answer !== existing) prompted.push(entry.key);
      continue;
    }

    // No existing value. Use template default if it's a concrete value.
    if (entry.value && !isPlaceholder(entry.value)) {
      const answer = opts.nonInteractive
        ? entry.value
        : await text(entry.key, { default: entry.value });
      resolved.push({ key: entry.key, value: answer });
      if (!opts.nonInteractive && answer !== entry.value) prompted.push(entry.key);
      continue;
    }

    // Placeholder or empty in template — must be filled in by operator.
    if (opts.nonInteractive) {
      process.stderr.write(`✗ ${entry.key} is required and --non-interactive was set. Aborting.\n`);
      process.exit(1);
    }
    const answer = await text(entry.key, {
      validate: (v) => (v.trim() ? null : "Required."),
    });
    resolved.push({ key: entry.key, value: answer });
    prompted.push(entry.key);
  }

  const output = formatEnvFile(resolved);

  if (outPath) {
    const resolvedOut = resolve(outPath);
    try {
      writeFileSync(resolvedOut, output, { mode: 0o600 });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        process.stderr.write(`✗ Permission denied writing to ${resolvedOut}. Run with sudo.\n`);
        process.exit(1);
      }
      throw err;
    }
    process.stderr.write(`✓ Wrote ${resolvedOut}\n`);
  } else {
    process.stdout.write(output);
  }

  if (generatedSecrets.length > 0) {
    process.stderr.write(`  Generated secrets: ${generatedSecrets.join(", ")}\n`);
  }
  if (preservedSecrets.length > 0) {
    process.stderr.write(
      `  Preserved secrets: ${preservedSecrets.join(", ")} (pass --rotate to regenerate)\n`,
    );
  }
  if (prompted.length > 0) {
    process.stderr.write(`  Changed: ${prompted.join(", ")}\n`);
  }

  // RPM host: offer to run migrate + seed + enable now. Require BOTH
  // isRpmHost (template detected on disk → systemd units are installed)
  // AND outPath === canonical sysconfig path (operator didn't redirect
  // with --output to a test file). Non-interactive mode prints the
  // equivalent commands instead of prompting.
  if (isRpmHost && outPath === RPM_SYSCONFIG_PATH) {
    if (opts.nonInteractive) {
      printManualNext();
    } else {
      await offerAutoProgress(sysconfigExistedAtStart);
    }
  }
}

async function offerAutoProgress(sysconfigExistedAtStart: boolean): Promise<void> {
  const mainActive = await systemctlIsActive("turf-tracker.service");
  if (mainActive) {
    process.stderr.write(
      `\n✓ turf-tracker.service is already active. Restart to pick up env changes:\n` +
        `    sudo systemctl restart turf-tracker.service\n`,
    );
    return;
  }

  process.stderr.write("\n");
  const proceed = await confirm("Run migrations + seed + enable turf-tracker.service now?", true);
  if (!proceed) {
    printManualNext();
    return;
  }

  await systemctlRun("start", "turf-tracker-migrate.service");
  await systemctlRun("start", "turf-tracker-seed.service");
  await systemctlRun("enable", "--now", "turf-tracker.service");
  process.stderr.write(`\n✓ turf-tracker is up.\n`);

  // First-install user bootstrap. Offer to create the initial user.
  // Turf has no application-level admin role (roles are per-property),
  // so the prompt is just "first user". Operator assigns property
  // ownership in the web UI after sign-in.
  //
  // Gate split by first-install vs re-run:
  //   - First install (sysconfigExistedAtStart === false): the
  //     in-process Prisma client was initialized at module load with
  //     the empty default.env env (no /etc/sysconfig yet), so
  //     `prisma.user.count()` can't reach the DB. We assume "no users
  //     exist" because the install is fresh and unconditionally offer.
  //   - Re-run (sysconfigExistedAtStart === true): the wrapper sourced
  //     a real sysconfig at process start, Prisma is live, gate on
  //     actual user count.
  //
  // Either way, the user-creation step runs in a fresh subprocess via
  // /usr/bin/turf so the wrapper re-sources whatever sysconfig is on
  // disk now — captures the values we just wrote in this run.
  const shouldOffer = sysconfigExistedAtStart ? await userTableEmpty() : true;
  if (shouldOffer) {
    await offerUserCreation();
  }
}

function printManualNext(): void {
  process.stderr.write(
    `\nNext (run manually):\n` +
      `  sudo systemctl start turf-tracker-migrate.service\n` +
      `  sudo systemctl start turf-tracker-seed.service\n` +
      `  sudo systemctl enable --now turf-tracker.service\n` +
      `  sudo turf users:create    # initial user if none exists\n`,
  );
}

async function userTableEmpty(): Promise<boolean> {
  try {
    return (await prisma.user.count()) === 0;
  } catch {
    // DB unreachable from this process. On re-run that's surprising
    // (sysconfig was already on disk at module load), so skip the
    // prompt rather than spawning a child that would also fail.
    return false;
  }
}

async function offerUserCreation(): Promise<void> {
  process.stderr.write("\n");
  const proceed = await confirm("Create the first user now?", true);
  if (!proceed) {
    process.stderr.write(`Skipped. Create later with: sudo turf users:create\n`);
    return;
  }
  // Spawn a fresh /usr/bin/turf so the wrapper re-sources the
  // sysconfig we just wrote — the in-process Prisma client was init'd
  // before the file existed, so calling createUser() here against the
  // local prisma import would hit a connection failure.
  await new Promise<void>((res, rej) => {
    const proc = spawn("/usr/bin/turf", ["users:create"], { stdio: "inherit" });
    proc.on("error", rej);
    proc.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`turf users:create exited with code ${code}`)),
    );
  });
}
