import { Command } from "commander";
import { register as registerBackup } from "./commands/backup";
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

  registerBackup(program);
  registerRestore(program);
  registerSetup(program);
  registerStatus(program);
  registerUpgrade(program);
  registerUsers(program);

  return program;
}
