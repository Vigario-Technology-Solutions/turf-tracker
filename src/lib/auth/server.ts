import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { haveIBeenPwned } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import prisma from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";

/**
 * Better-Auth server config.
 *
 * Phase 1 scope: email + password only. Magic-link, OAuth, and
 * device-binding are deferred — see SPEC §8.3 / §9. Per-property
 * permissions (owner/contributor/viewer) live in PropertyMember and
 * are checked by domain code, not by auth-layer roles.
 *
 * Password hashing uses argon2id with a server-side pepper via
 * @node-rs/argon2 — see ./password.ts.
 *
 * The Prisma adapter expects matching column names on User / Session /
 * Account / Verification — see prisma/schema.prisma. Domain extensions
 * to the User shape (displayName, defaultPropertyId, unitSystem,
 * currency) are declared in `additionalFields` AND mirrored as schema
 * columns. Either side without the other breaks the adapter.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    autoSignIn: true,
    password: {
      hash: async (password) => hashPassword(password),
      verify: async ({ password, hash }) => verifyPassword(password, hash),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  user: {
    // Mirrors the domain extensions on the User Prisma model. Better-Auth
    // accepts these on signUpEmail / updateUser and persists them via the
    // adapter. Don't add a column without also adding it here.
    additionalFields: {
      displayName: { type: "string", required: false, input: true },
      defaultPropertyId: { type: "string", required: false, input: true },
      unitSystem: { type: "string", required: false, input: true },
      currency: { type: "string", required: false, input: true },
    },
  },
  rateLimit: {
    // In-memory single-process limiter. Switch to "secondary-storage"
    // (Redis) if/when we run multiple Node processes.
    enabled: true,
    storage: "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 900, max: 5 },
      "/sign-up/email": { window: 3600, max: 10 },
      "/forget-password": { window: 3600, max: 5 },
    },
  },
  plugins: [
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        "This password has appeared in a known data breach. Please choose a different password.",
    }),
    // Must be the last plugin per better-auth docs — wraps responses to
    // attach Set-Cookie headers in Next.js server actions / route handlers.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
