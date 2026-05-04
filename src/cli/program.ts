import { Command } from "commander";
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

  registerUsers(program);

  return program;
}
