import fs from "fs/promises";

/**
 * File-based exclusive lock with stale-detection.
 *
 * Used by `turf backup` and `turf restore` to prevent two destructive
 * operations from racing against each other (a restore mid-backup
 * leaves an inconsistent tarball; two restores leave undefined DB
 * state). flock(2) isn't directly exposed by Node, so this uses the
 * canonical create-with-O_EXCL-and-write-pid pattern:
 *
 *   1. Atomically create the lock file at `lockPath` with O_CREAT |
 *      O_EXCL via fs.writeFile(..., { flag: "wx" }), writing our PID
 *      to the file as a status marker.
 *   2. On EEXIST, read the PID and signal(0) it. If it's still alive,
 *      another holder owns the lock — abort with a clear error.
 *   3. If signal(0) returns ESRCH (no such process), the lock is
 *      stale from a crashed run — unlink and retry once.
 *
 * The lock file lives at /run/turf-tracker/backup.lock (volatile
 * tmpfs, cleared at boot, recreated by tmpfiles.d at 0700 root:root).
 * Both `turf backup` and `turf restore` run as root via sudo, so the
 * lock file is always root-owned and the PID check has access to
 * /proc/<pid> for signal(0).
 */
export interface FileLock {
  release(): Promise<void>;
}

export async function acquireFileLock(lockPath: string, description: string): Promise<FileLock> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.writeFile(lockPath, String(process.pid), { flag: "wx" });
      return {
        async release(): Promise<void> {
          await fs.unlink(lockPath).catch(() => undefined);
        },
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw err;

      // Lock file exists. Check whether the holder is still alive.
      const content = await fs.readFile(lockPath, "utf8").catch(() => "");
      const pid = parseInt(content.trim(), 10);
      if (!Number.isFinite(pid)) {
        // Malformed lock file — treat as stale, retry once.
        await fs.unlink(lockPath).catch(() => undefined);
        continue;
      }
      try {
        process.kill(pid, 0);
        // Holder still alive.
        throw new Error(
          `Another ${description} is already in progress (PID ${pid}). Lock at ${lockPath}.`,
        );
      } catch (signalErr) {
        if ((signalErr as NodeJS.ErrnoException).code === "ESRCH") {
          // Holder dead — stale lock, remove and retry.
          await fs.unlink(lockPath).catch(() => undefined);
          continue;
        }
        throw signalErr;
      }
    }
  }
  throw new Error(`Could not acquire ${description} lock at ${lockPath}.`);
}
