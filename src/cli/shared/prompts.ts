import * as readline from "node:readline";

/**
 * Tiny readline wrappers used by interactive CLI commands. Convention:
 *   - Prompt + status text goes to stderr.
 *   - Data (table rows, JSON) goes to stdout.
 *
 * That split lets `turf users:list --json | jq …` work without prompts
 * polluting the pipeline. Same pattern vis-daily-tracker uses.
 */

interface TextOpts {
  default?: string;
  validate?: (value: string) => string | null;
}

export async function text(question: string, opts: TextOpts = {}): Promise<string> {
  const suffix = opts.default !== undefined ? ` (${opts.default})` : "";
  while (true) {
    const answer = await ask(`${question}${suffix}: `);
    const value = answer.trim() || opts.default || "";
    const error = opts.validate?.(value);
    if (error) {
      process.stderr.write(`  ${error}\n`);
      continue;
    }
    return value;
  }
}

export async function password(question: string): Promise<string> {
  return ask(`${question}: `);
}

export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? " [Y/n]" : " [y/N]";
  const answer = (await ask(`${question}${suffix}: `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return /^y(es)?$/.test(answer);
}

export async function select<T extends string>(
  question: string,
  choices: readonly { value: T; label: string }[],
  defaultIndex = 0,
): Promise<T> {
  process.stderr.write(`${question}\n`);
  for (const [i, choice] of choices.entries()) {
    process.stderr.write(`  ${i + 1}. ${choice.label}\n`);
  }
  while (true) {
    const answer = await ask(`Select [1-${choices.length}] (${defaultIndex + 1}): `);
    const trimmed = answer.trim() || String(defaultIndex + 1);
    const index = Number.parseInt(trimmed, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < choices.length) {
      return choices[index].value;
    }
    process.stderr.write(`  Invalid choice.\n`);
  }
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Render an array of homogeneous string-record rows as an aligned
 * monospace table. Headers come from the keys of the first row.
 */
export function table(rows: Record<string, string>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => (r[h] ?? "").length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  return [fmt(headers), sep, ...rows.map((r) => fmt(headers.map((h) => r[h] ?? "")))].join("\n");
}
