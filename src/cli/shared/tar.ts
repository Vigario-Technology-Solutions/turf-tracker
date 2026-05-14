/**
 * Runtime check for the `tar` binary used by `turf backup` and
 * `turf restore` to bundle / unpack the storage tree.
 *
 * Parity with `pgDumpAvailable` in postgres-tools.ts: `tar` is not
 * declared as a hard `Requires:` in the spec because every Fedora
 * base install ships it (coreutils dependency chain), and surfacing
 * a clear install hint at the first failing call is more honest than
 * an unconditional Requires that would resolve trivially anyway.
 * The check exists so a stripped container or unusual host (no
 * coreutils, segregated tooling) gets a readable error instead of
 * an opaque ENOENT from spawn().
 */

import { spawn } from "node:child_process";

export async function tarAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("tar", ["--version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}
