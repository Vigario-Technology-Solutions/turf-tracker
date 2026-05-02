/**
 * Next.js instrumentation hook.
 *
 * `register()` runs once when the server starts (under `next start`
 * and `next dev`) but NOT during `next build`. Use it to gate
 * runtime-required configuration: anything that would break a
 * request handler if missing should throw here so the server fails
 * fast before serving any traffic.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateRuntimeConfig } = await import("@/lib/runtime-config");
  validateRuntimeConfig();
}
