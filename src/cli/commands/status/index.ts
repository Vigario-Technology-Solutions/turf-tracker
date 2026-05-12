import { request } from "node:http";
import { existsSync } from "node:fs";
import type { Command } from "commander";
import prisma from "@/lib/db";
import { systemctlIsActive, systemctlIsEnabled } from "../../shared/systemctl";

/**
 * Composite health check. Runs every diagnostic relevant to a deployed
 * turf-tracker and renders a one-line-per-check report:
 *
 *   - Env override file presence
 *   - Required-env vars all set in the wrapper's process environment
 *     (the turf wrapper sources both default.env and the override
 *     before exec'ing node, so process.env reflects the runtime contract)
 *   - Database connection + latest applied migration
 *   - Main service unit active state
 *   - Migrate + seed unit last-run state (oneshots; "active (exited)"
 *     after a successful run, "inactive (dead)" if never invoked)
 *   - Auto-upgrade Path unit enabled state (informational — not a
 *     failure either way)
 *   - /api/health response (loopback to whatever PORT is configured)
 *
 * Exits 0 if every check passes, non-zero if any required check fails.
 * The Path-unit check is informational and never counts as a failure.
 * Mirrors the `occ status` idiom from Nextcloud: one command answers
 * "is this deploy healthy?"
 */

const ENV_FILE = "/etc/sysconfig/turf-tracker";
const REQUIRED_ENV = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "AUTH_PASSWORD_PEPPER",
];

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
  informational?: boolean;
}

export function register(program: Command): void {
  program
    .command("status")
    .description("Composite health check: env, DB, schema, services, /api/health")
    .action(async () => {
      try {
        await run();
      } finally {
        await prisma.$disconnect();
      }
    });
}

async function run(): Promise<void> {
  const checks: CheckResult[] = [];

  checks.push({
    name: "Env override file",
    ok: existsSync(ENV_FILE),
    detail: ENV_FILE,
  });

  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  checks.push({
    name: "Required env vars",
    ok: missing.length === 0,
    detail:
      missing.length === 0 ? `all ${REQUIRED_ENV.length} set` : `missing: ${missing.join(", ")}`,
  });

  checks.push(await checkDatabase());

  for (const unit of [
    "turf-tracker.service",
    "turf-tracker-migrate.service",
    "turf-tracker-seed.service",
  ]) {
    const active = await systemctlIsActive(unit);
    checks.push({
      name: unit,
      // Only the main service must be active to pass. Oneshots are
      // "active (exited)" after a successful run and "inactive (dead)"
      // until first invoked — neither state is a failure.
      ok: unit === "turf-tracker.service" ? active : true,
      detail: active ? "active" : "inactive",
      informational: unit !== "turf-tracker.service",
    });
  }

  const pathEnabled = await systemctlIsEnabled("turf-tracker-upgrade.path");
  checks.push({
    name: "Auto-upgrade Path unit",
    ok: true,
    detail: pathEnabled
      ? "enabled (dnf upgrade triggers `turf upgrade` automatically)"
      : "not enabled (run `sudo turf upgrade` manually after dnf transactions)",
    informational: true,
  });

  checks.push(await checkHealth());

  for (const c of checks) {
    const icon = c.ok ? "✓" : c.informational ? "•" : "✗";
    process.stderr.write(`${icon} ${c.name}${c.detail ? ` — ${c.detail}` : ""}\n`);
  }

  const failed = checks.filter((c) => !c.ok && !c.informational).length;
  process.exit(failed === 0 ? 0 : 1);
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const rows = await prisma.$queryRaw<
      { migration_name: string }[]
    >`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
    const last = rows[0]?.migration_name ?? "(none applied)";
    return { name: "Database", ok: true, detail: `connected; latest migration: ${last}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name: "Database", ok: false, detail: message.split("\n")[0] };
  }
}

function checkHealth(): Promise<CheckResult> {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  return new Promise((resolveP) => {
    const req = request({ host: "127.0.0.1", port, path: "/api/health", timeout: 5000 }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        const ok = res.statusCode === 200;
        resolveP({
          name: "/api/health",
          ok,
          detail: ok ? `200 ${body.slice(0, 80)}` : `HTTP ${res.statusCode ?? "?"}`,
        });
      });
    });
    req.on("error", (err) => resolveP({ name: "/api/health", ok: false, detail: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolveP({ name: "/api/health", ok: false, detail: "timeout" });
    });
    req.end();
  });
}
