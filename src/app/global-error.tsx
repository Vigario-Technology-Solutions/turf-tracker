"use client";

/**
 * Top-of-tree error boundary. Catches errors that escape the
 * per-route `error.tsx` boundaries (root-layout errors, render-time
 * crashes, etc.) and reports them to Sentry. Per Next's contract,
 * this file replaces the entire root-layout when an error is caught,
 * so it must include `<html>` and `<body>` itself.
 */

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
