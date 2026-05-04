import type { Command } from "commander";
import { register as registerCreate } from "./create";
import { register as registerList } from "./list";

export function registerUsers(program: Command): void {
  registerCreate(program);
  registerList(program);
}
