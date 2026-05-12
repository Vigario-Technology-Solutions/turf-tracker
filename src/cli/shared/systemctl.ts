/**
 * Thin wrappers around `systemctl` for CLI commands that drive
 * systemd state (upgrade, status). Kept in shared so the
 * orchestration shape stays consistent across commands — each
 * invocation prints `$ systemctl <args>` to stderr before running so
 * the operator sees what's happening, and exit codes propagate as
 * thrown errors (caught by the top-level `try/catch` in
 * `src/cli/index.ts` which formats them as `error: <message>`).
 */

import { spawn } from "node:child_process";

/** Returns true when systemctl reports the unit as active. */
export function systemctlIsActive(unit: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("systemctl", ["is-active", "--quiet", unit], { stdio: "ignore" });
    proc.on("exit", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

/** Returns true when systemctl reports the unit as enabled (started at boot or via Wants/Requires chains). */
export function systemctlIsEnabled(unit: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("systemctl", ["is-enabled", "--quiet", unit], { stdio: "ignore" });
    proc.on("exit", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

/** Run `systemctl <args>` with output streamed to the operator. Throws on non-zero exit. */
export function systemctlRun(...args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stderr.write(`  $ systemctl ${args.join(" ")}\n`);
    const proc = spawn("systemctl", args, { stdio: "inherit" });
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`systemctl ${args.join(" ")} exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}
