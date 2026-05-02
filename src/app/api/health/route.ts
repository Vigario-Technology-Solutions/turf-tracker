import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * Liveness probe — returns 200 if the process is running and the database
 * is reachable, 503 otherwise. No auth required.
 *
 * Used by:
 *   - Prod deploy script's post-swap health check (MANIFEST.healthCheckPath)
 *   - Any future uptime monitoring
 *
 * Reaches the DB via SELECT 1 so this catches connection pool exhaustion /
 * network partition / wrong DATABASE_URL, not just "the Node process is up".
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
