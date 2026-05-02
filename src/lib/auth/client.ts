"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { Auth } from "./server";

/**
 * Better-Auth React client. `inferAdditionalFields<Auth>()` widens the
 * client's user-shape types to include the domain extensions declared in
 * server.ts (displayName, defaultPropertyId, etc.) so callers get type
 * safety without re-declaring the field list here.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
