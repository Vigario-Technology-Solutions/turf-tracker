import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * Liveness probe — returns 200 if the process is running and the database
 * is reachable, 503 otherwise. No auth required.
 *
 * Used by the prod deploy script's pre-swap + post-swap health checks
 * (path hardcoded in docs/deployment.md) and any future uptime monitoring.
 *
 * Reaches the DB via SELECT 1 so this catches connection pool exhaustion /
 * network partition / wrong DATABASE_URL, not just "the Node process is up".
 * Schema-agnostic — required for the migration backward-compat invariant
 * (new code must boot against the previous release's schema during the
 * prod pre-swap smoke).
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
