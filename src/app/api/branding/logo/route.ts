/**
 * Public logo serve. Renders the `logoFile` column of the singleton
 * Settings row from `/var/lib/turf-tracker/branding/`. No auth — the
 * chrome logo appears on unauthenticated routes (the auth pages) by
 * design.
 *
 * Logo files are PNG/SVG, hash-named on upload. When an admin
 * replaces the logo, the prior file is deleted and the new file has
 * a different hash; chrome re-renders the <Image> with the same URL
 * (/api/branding/logo) but the underlying bytes are different,
 * forcing the browser to re-fetch.
 *
 * 404 paths:
 *   - Settings.logoFile is null → 404 (chrome should be reading
 *     getBrand().chromeLogoSrc which falls through to the bundled
 *     SVG URL, so this route never gets called in that case).
 *   - logoFile is set but the file on disk is missing → 404.
 *
 * Upload mechanism is a follow-up (admin UI + `turf brand:set
 * --logo=<path>`). For now, operators who want a custom logo:
 *   1. Place the file under /var/lib/turf-tracker/branding/
 *      (chown turf-tracker:turf-tracker, 0644).
 *   2. Set Settings.logoFile to the basename via direct DB write
 *      OR the future `turf brand:set` CLI.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";

const BRANDING_DIR = "/var/lib/turf-tracker/branding";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function GET() {
  const row = await prisma.settings.findUnique({
    where: { id: 1 },
    select: { logoFile: true },
  });
  const logoFile = row?.logoFile;
  if (!logoFile) {
    return new NextResponse(null, { status: 404 });
  }

  // Defense in depth: validate the resolved path stays under the
  // branding directory. Path-traversal via a malicious Settings row
  // would otherwise let an attacker who got DB write access serve
  // arbitrary host files through this endpoint.
  const target = resolve(BRANDING_DIR, logoFile);
  if (target !== BRANDING_DIR && !target.startsWith(BRANDING_DIR + sep)) {
    return new NextResponse(null, { status: 404 });
  }
  if (!existsSync(target)) {
    return new NextResponse(null, { status: 404 });
  }

  const bytes = await readFile(target);
  const ext = extname(target).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      // Immutable cache: hash-named files don't change in place. When
      // the operator uploads a new logo, the previous file is deleted
      // and the new one has a different hash; chrome re-renders the
      // <Image> with the same URL but the underlying bytes differ.
      // Browsers refresh because the ETag / Last-Modified differs.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
