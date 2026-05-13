import { spawn, spawnSync } from "node:child_process";
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
 *     path, output defaults to `/etc/sysconfig/turf-tracker` at
 *     0o640 root:turf-tracker, and after writing the env file the
 *     command offers to run
 *     `systemctl start turf-tracker-migrate`, `turf-tracker-seed`, then
 *     `enable --now turf-tracker.service` so first-install setup is a
 *     single command. Requires root.
 *
 *   - **Dev host** (no RPM template). Template defaults to
 *     `./.env.example`, output defaults to `./.env`. No systemctl
 *     orchestration — re-running just audits + edits the local env
 *     file in place. Pass `--output -` to print to stdout instead
 *     (useful for previewing).
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
 * Commented-out `# KEY=value` lines in the TEMPLATE are skipped —
 * those are optional / example-only vars that the template documents
 * but doesn't force the operator to set.
 *
 * Re-running setup on an existing env file is idempotent, lossless,
 * and supports audit + edit:
 *
 *   - The EXISTING output file is preserved line-by-line. Every
 *     comment, blank line, and key-value pair stays — including
 *     keys not mentioned in the current template (operator
 *     additions, settings carried over from an older release that
 *     dropped the var, etc.). Only template-known keys are edited
 *     in place; novel keys get appended.
 *   - Non-secret template keys with an existing value get prompted
 *     with the existing value as the default. Operator presses
 *     enter to keep, types to change. Lets the operator audit
 *     current config (see what's set) and rotate specific values
 *     without editing the file by hand or losing other state.
 *   - Secret keys (auto-generated 32-byte hex) are NEVER auto-rotated
 *     on re-run and their existing values are NEVER shown in the
 *     prompt (would leak through terminal scrollback / shell history).
 *     Preserved silently and reported in a summary line. Pass
 *     `--rotate` to regenerate every secret key.
 *   - Newly-introduced template keys since the file was last written
 *     get prompted and appended — re-running after a release that
 *     adds a new required var just asks about the new one.
 *
 * `--non-interactive` fails fast if any prompt would be needed (for
 * ansible / automation). On RPM hosts it also skips the systemctl
 * orchestration prompt and prints the equivalent commands instead.
 */

const RPM_TEMPLATE_PATH = "/usr/lib/turf-tracker/default.env";
const RPM_SYSCONFIG_PATH = "/etc/sysconfig/turf-tracker";
const DEV_ENV_PATH = ".env";

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

/**
 * Existing-file parse representation. Preserves every line in order —
 * comments, blank lines, and KEY=value pairs — so re-run rewrites
 * are lossless. The template parser is narrower (template entries
 * drive the prompt flow); this one is structural.
 */
type FileLine = { kind: "raw"; text: string } | { kind: "value"; key: string; value: string };

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

function parseFile(src: string): FileLine[] {
  const lines: FileLine[] = [];
  const rawLines = src.split(/\r?\n/);
  // Drop the empty trailing entry produced by a final newline so we
  // don't preserve a phantom blank line on round-trip.
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }
  for (const line of rawLines) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) {
      lines.push({ kind: "value", key: match[1], value: match[2] });
    } else {
      lines.push({ kind: "raw", text: line });
    }
  }
  return lines;
}

function serializeFile(lines: FileLine[]): string {
  return lines.map((l) => (l.kind === "value" ? `${l.key}=${l.value}` : l.text)).join("\n") + "\n";
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

function hex(): string {
  return randomBytes(32).toString("hex");
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
  // stdout (standard UNIX convention) — useful when the operator
  // wants to preview the env file before writing it. Otherwise infer
  // from host: prod writes to /etc/sysconfig/turf-tracker (root-owned,
  // strict perms); dev writes to ./.env in the project root.
  const outPath =
    opts.output === "-"
      ? undefined
      : (opts.output ?? (isRpmHost ? RPM_SYSCONFIG_PATH : DEV_ENV_PATH));

  // Read existing output file structurally — every line preserved
  // (comments, blanks, KEY=value, non-template keys). The merge
  // updates template-known keys in place and appends novel ones;
  // operator additions (custom flags outside the template, settings
  // carried over from an older release that dropped the var, etc.)
  // survive unchanged.
  const existingLines: FileLine[] =
    outPath && existsSync(outPath) ? parseFile(readFileSync(outPath, "utf8")) : [];
  const existingByKey = new Map<string, string>();
  for (const line of existingLines) {
    if (line.kind === "value") existingByKey.set(line.key, line.value);
  }

  const resolvedByKey = new Map<string, string>();
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
        resolvedByKey.set(entry.key, existing);
        preservedSecrets.push(entry.key);
        continue;
      }
      resolvedByKey.set(entry.key, hex());
      generatedSecrets.push(entry.key);
      continue;
    }

    // Non-secret with existing value: prompt with existing as default.
    // Operator presses enter to keep, types to change. The existing
    // value is visible in the prompt — fine for non-secrets, and the
    // audit affordance is the point.
    if (hasExisting) {
      if (opts.nonInteractive) {
        resolvedByKey.set(entry.key, existing);
        continue;
      }
      const answer = await text(entry.key, { default: existing });
      resolvedByKey.set(entry.key, answer);
      if (answer !== existing) prompted.push(entry.key);
      continue;
    }

    // No existing value. Use template default if it's a concrete value.
    if (entry.value && !isPlaceholder(entry.value)) {
      const answer = opts.nonInteractive
        ? entry.value
        : await text(entry.key, { default: entry.value });
      resolvedByKey.set(entry.key, answer);
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
    resolvedByKey.set(entry.key, answer);
    prompted.push(entry.key);
  }

  // Merge resolved values back into the existing line structure.
  // Template-known keys that already exist are edited in place;
  // novel keys are appended. Every other line (comments, blanks,
  // non-template keys) is preserved verbatim.
  const outputLines: FileLine[] = [...existingLines];
  for (const [key, value] of resolvedByKey) {
    const idx = outputLines.findIndex((l) => l.kind === "value" && l.key === key);
    if (idx >= 0) {
      outputLines[idx] = { kind: "value", key, value };
    } else {
      outputLines.push({ kind: "value", key, value });
    }
  }

  const output = serializeFile(outputLines);

  if (outPath) {
    const resolvedOut = resolve(outPath);
    try {
      // 0o640 root:turf-tracker is the canonical service-secrets
      // pattern (mirrors /etc/shadow:root:shadow,
      // /etc/ssl/private/*.key:root:ssl-cert). The service uid reads
      // via group membership; systemd-invoked unit paths and the CLI
      // wrapper's skip-when-DATABASE_URL-set logic both work without
      // privilege-dropping gymnastics.
      writeFileSync(resolvedOut, output, { mode: 0o640 });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        process.stderr.write(`✗ Permission denied writing to ${resolvedOut}. Run with sudo.\n`);
        process.exit(1);
      }
      throw err;
    }
    // chown root:turf-tracker if we're writing the canonical sysconfig
    // path AND the turf-tracker group exists (RPM host). Skipped
    // silently for custom --output paths or dev hosts where the group
    // hasn't been created.
    if (resolvedOut === RPM_SYSCONFIG_PATH) {
      const chown = spawnSync("chown", ["root:turf-tracker", resolvedOut]);
      if (chown.status !== 0) {
        process.stderr.write(
          `  Note: chown root:turf-tracker ${resolvedOut} failed — the service user won't be able to read this file via group membership. Fix: \`sudo chown root:turf-tracker ${resolvedOut}\`.\n`,
        );
      }
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
