import os from "node:os";

/**
 * Emit a structured audit line to stderr for destructive CLI actions.
 *
 * Format is intentionally `key=value` pairs on a single line so
 * `journalctl` / log aggregators can grep and parse without a
 * dedicated logger. `runner` reads from $USER (Unix) / $USERNAME
 * (Windows) and falls back to "unknown" if neither is set (e.g.
 * systemd unit with empty environment).
 *
 * Stays a stderr line, not a DB row, by design: solo-dev today, no
 * audit table for CLI actions, and journalctl already retains it.
 * Promote to a real audit table when there's a second operator.
 *
 * Mirrors vis-daily-tracker's `src/cli/shared/audit.ts`.
 */
export function auditCli(action: string, fields: Record<string, string | number>): void {
  const runner = process.env.USER ?? process.env.USERNAME ?? "unknown";
  const host = os.hostname();
  const at = new Date().toISOString();
  const pairs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  process.stderr.write(`[audit] cli action=${action} ${pairs} runner=${runner}@${host} at=${at}\n`);
}
