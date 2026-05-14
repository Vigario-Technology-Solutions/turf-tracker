import type { Command } from "commander";
import prisma from "@/lib/db";
// Import setBrand from the Next-free settings module. Going through
// @/lib/brand would also work (it re-exports setBrand) but would
// drag next/cache + next/server into the CLI bundle's import graph.
import { setBrand } from "@/lib/settings";

/**
 * `turf brand:set` — operator-side brand text updates.
 *
 * Headless equivalent of the admin Settings UI's Brand section (when
 * it ships). For deployments without an interactive admin (CI/CD
 * provisioning, kiosk setups, or quick edits over SSH). Writes the
 * typed Settings columns directly; the running app picks up the
 * change within the 60s unstable_cache revalidate window (no service
 * restart needed).
 *
 * Logo file management: the upload mechanism (admin UI multipart
 * POST + hash-naming + prior-file cleanup) is a follow-up.
 * Operators with a custom logo today drop the file under
 * /var/lib/turf-tracker/branding/ themselves and set
 * `Settings.logoFile` via `--logo-file=<basename>` here.
 *
 * Examples:
 *     sudo turf brand:set --owner="Mariposa Lawn Care"
 *     sudo turf brand:set --app-name="Turf Tracker" --short-name="Turf"
 *     sudo turf brand:set --clear-owner --clear-short-name
 *     sudo turf brand:set --logo-file=mariposa.png
 */
export function register(program: Command): void {
  program
    .command("brand:set")
    .description("Update per-deployment brand fields (text + logo filename)")
    .option(
      "--app-name <name>",
      "Full product name (browser title, nav heading, auth chrome, manifest)",
    )
    .option(
      "--short-name <name>",
      "Constrained-space variant (manifest short_name, iOS home-screen pin)",
    )
    .option("--clear-short-name", "Clear the short name (falls back to app name)")
    .option("--owner <name>", "Operator's company name (auth-chrome subtitle)")
    .option("--clear-owner", "Clear the owner (no subtitle rendered)")
    .option(
      "--logo-file <basename>",
      "Filename (no path) under /var/lib/turf-tracker/branding/. File itself must already exist there.",
    )
    .option("--clear-logo", "Clear the logo (chrome falls back to bundled icon)")
    .action(
      async (opts: {
        appName?: string;
        shortName?: string;
        clearShortName?: boolean;
        owner?: string;
        clearOwner?: boolean;
        logoFile?: string;
        clearLogo?: boolean;
      }) => {
        try {
          // Reject combinations that contradict each other up front.
          if (opts.shortName && opts.clearShortName) {
            process.stderr.write(`✗ --short-name and --clear-short-name are mutually exclusive\n`);
            process.exit(1);
          }
          if (opts.owner && opts.clearOwner) {
            process.stderr.write(`✗ --owner and --clear-owner are mutually exclusive\n`);
            process.exit(1);
          }
          if (opts.logoFile && opts.clearLogo) {
            process.stderr.write(`✗ --logo-file and --clear-logo are mutually exclusive\n`);
            process.exit(1);
          }

          const updates: Parameters<typeof setBrand>[0] = {};
          if (opts.appName !== undefined) updates.appName = opts.appName;
          if (opts.shortName !== undefined) updates.appShortName = opts.shortName;
          else if (opts.clearShortName) updates.appShortName = null;
          if (opts.owner !== undefined) updates.appOwner = opts.owner;
          else if (opts.clearOwner) updates.appOwner = null;
          if (opts.logoFile !== undefined) updates.logoFile = opts.logoFile;
          else if (opts.clearLogo) updates.logoFile = null;

          if (Object.keys(updates).length === 0) {
            process.stderr.write(
              `✗ No fields to update. Pass at least one of: --app-name, --short-name, --owner, --logo-file (or their --clear-* variants).\n`,
            );
            process.exit(1);
          }

          await setBrand(updates);

          const row = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
          process.stderr.write(`✓ Brand updated.\n`);
          process.stderr.write(`  appName:      ${row.appName}\n`);
          process.stderr.write(
            `  appShortName: ${row.appShortName ?? "(unset → falls back to appName)"}\n`,
          );
          process.stderr.write(`  appOwner:     ${row.appOwner ?? "(unset → no subtitle)"}\n`);
          process.stderr.write(`  logoFile:     ${row.logoFile ?? "(unset → bundled icon)"}\n`);
          process.stderr.write(
            `\n  Running service picks up changes within 60s (the unstable_cache revalidate window).\n`,
          );
        } finally {
          await prisma.$disconnect();
        }
      },
    );
}
