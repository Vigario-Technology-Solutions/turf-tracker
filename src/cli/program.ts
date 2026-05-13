import { Command } from "commander";
import * as Sentry from "@sentry/node";
import { register as registerBackup } from "./commands/backup";
import { register as registerBrand } from "./commands/brand";
import { register as registerRestore } from "./commands/restore";
import { register as registerSetup } from "./commands/setup";
import { register as registerStatus } from "./commands/status";
import { register as registerUpgrade } from "./commands/upgrade";
import { registerUsers } from "./commands/users";

/**
 * Construct the CLI program without parsing argv. The entry point
 * (`./index.ts`) calls `parseAsync()` to actually run; build tooling
 * imports this directly to introspect registered subcommands without
 * triggering execution.
 */
export function createProgram(): Command {
  const program = new Command();
  program.name("turf").description("turf-tracker operational CLI").showHelpAfterError();

  // Tag every CLI invocation with the subcommand name. Without this,
  // Sentry events from `turf upgrade`, `turf backup`, `turf status`,
  // etc. group together as "CLI threw" — but the operational response
  // is very different per subcommand (a failed upgrade needs immediate
  // attention; a failed status check might just be a journald hiccup),
  // so we want to filter them apart in the dashboard. preAction fires
  // after commander resolves the action handler but before it runs, so
  // the tag is set on the current scope by the time the action's code
  // executes; uncaught throws pick it up via Sentry's default global
  // handlers + the explicit captureException wrapper in index.ts.
  program.hook("preAction", (_thisCommand, actionCommand) => {
    Sentry.setTag("cli.command", actionCommand.name());
  });

  registerBackup(program);
  registerBrand(program);
  registerRestore(program);
  registerSetup(program);
  registerStatus(program);
  registerUpgrade(program);
  registerUsers(program);

  return program;
}
