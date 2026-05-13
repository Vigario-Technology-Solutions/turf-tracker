import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { BRANDING_DIR } from "@/lib/runtime-config";

/**
 * Operator-overridable asset route. Serves logo + icons at
 * `/branding/<file>` URLs. Contract: docs/platform/branding.md.
 *
 *   1. If BRANDING_DIR is set AND `${BRANDING_DIR}/<file>` exists →
 *      serve operator file.
 *   2. Otherwise → serve bundled `public/branding/<file>`.
 *   3. Neither exists → 404.
 *
 * Bypasses Next's static-asset handling on purpose. App Router routes
 * claim `/branding/*` first, so even when BRANDING_DIR is unset we
 * still come through here and `readFile` the bundled default from
 * `process.cwd()/public/branding/`. Single source of truth for the
 * URL space; consumers don't have to know which path won.
 *
 * Traversal guard: `path.resolve` normalizes `..` segments; we
 * verify the resolved target stays under the base dir before
 * touching the filesystem.
 *
 * Cache headers: `public, max-age=3600` — moderate. Operators may
 * swap files mid-session during a branding pass; we don't want
 * browsers to pin the old asset for a day. The browser's heuristic
 * freshness rules already cache aggressively for image responses.
 */

const BUNDLED_DIR = join(process.cwd(), "public", "branding");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".gif": "image/gif",
};

function safeJoin(base: string, requested: string): string | null {
  const absBase = resolve(base);
  const target = resolve(absBase, requested);
  if (target !== absBase && !target.startsWith(absBase + sep)) {
    return null;
  }
  return target;
}

async function tryRead(base: string | null, requested: string): Promise<Buffer | null> {
  if (!base) return null;
  const target = safeJoin(base, requested);
  if (!target) return null;
  try {
    return await readFile(target);
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const requested = path.join("/");
  if (!requested) return new Response(null, { status: 404 });

  const data = (await tryRead(BRANDING_DIR, requested)) ?? (await tryRead(BUNDLED_DIR, requested));
  if (!data) return new Response(null, { status: 404 });

  const ext = extname(requested).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
