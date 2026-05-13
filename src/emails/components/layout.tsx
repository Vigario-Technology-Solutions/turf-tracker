import { Body, Container, Head, Html, Preview, Section, Link, Font } from "@react-email/components";
import * as React from "react";

/**
 * Shared layout chrome for every outbound email. Operator brand
 * (`appName`) is threaded as a prop into `EmailFooter`; template
 * bodies also take `appName` as a prop. Color palette is
 * WCAG-AA-compliant pairs — keep `primary` and `gray` legible
 * against `white` and `grayLight`.
 *
 * Shape lifted from vis-daily-tracker's email layout. Color tokens
 * adapted to turf's palette: green-700 for `primary` (matches the
 * bundled branding icon), neutral grays for the rest.
 */

export const colors = {
  primary: "#15803d",
  gray: "#4b5563",
  grayLight: "#f3f4f6",
  grayBorder: "#e5e7eb",
  white: "#ffffff",
};

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="x-apple-disable-message-reformatting" />
        <Font fontFamily="Segoe UI" fallbackFontFamily={["Arial", "Helvetica", "sans-serif"]} />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>{children}</Container>
      </Body>
    </Html>
  );
}

interface EmailFooterProps {
  appName: string;
  dashboardUrl: string;
}

export function EmailFooter({ appName, dashboardUrl }: EmailFooterProps) {
  return (
    <Section style={footer}>
      <Link href={dashboardUrl} style={footerLink}>
        {appName}
      </Link>
    </Section>
  );
}

const main = {
  backgroundColor: colors.grayLight,
  // Segoe UI first for Windows/Outlook, then Apple stack, then fallbacks.
  fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif",
  lineHeight: "1.5",
};

const container = {
  maxWidth: "520px",
  width: "100%",
  margin: "0 auto",
  padding: "24px 16px",
};

const footer = {
  padding: "16px 24px",
  borderTop: `1px solid ${colors.grayBorder}`,
  textAlign: "center" as const,
  backgroundColor: colors.white,
  borderRadius: "0 0 8px 8px",
};

const footerLink = {
  color: colors.primary,
  textDecoration: "none",
  fontSize: "13px",
  fontWeight: "500",
};
