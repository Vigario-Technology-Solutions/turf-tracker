import { Section, Text, Button } from "@react-email/components";
import { EmailLayout, EmailFooter, colors } from "./components/layout";

interface PasswordResetEmailProps {
  appName: string;
  greetingName: string;
  resetUrl: string;
}

/**
 * Self-serve password reset email. Sent from
 * /api/password-reset/request when the user clicks "Forgot password"
 * on the sign-in page.
 *
 * Username/email is NOT included in the body — turf's auth model is
 * email-only, so the recipient address itself is the identifier, and
 * echoing it back into the body would be redundant (and a minor
 * deliverability anti-pattern: SpamAssassin's HEADER_FROM_DIFFERENT_DOMAINS
 * and adjacent rules look askance at emails that quote the recipient
 * address back at them).
 */
export function PasswordResetEmail({ appName, greetingName, resetUrl }: PasswordResetEmailProps) {
  const dashboardUrl = new URL(resetUrl).origin;

  return (
    <EmailLayout preview={`Reset your ${appName} password`}>
      <Section style={header}>
        <Text style={headerTitle}>Password Reset</Text>
      </Section>

      <Section style={body}>
        <Text style={greeting}>Hi {greetingName},</Text>
        <Text style={paragraph}>
          Someone requested a password reset for your {appName} account. If that was you, click the
          button below to set a new password. If it wasn&apos;t, you can ignore this email — nothing
          will change.
        </Text>

        <Section style={buttonContainer}>
          <Button href={resetUrl} style={button}>
            Reset password
          </Button>
        </Section>

        <Text style={fineprint}>
          This link expires in 1 hour. Any devices currently signed in under your account will be
          signed out as soon as the new password is set.
        </Text>
      </Section>

      <EmailFooter appName={appName} dashboardUrl={dashboardUrl} />
    </EmailLayout>
  );
}

const header = {
  backgroundColor: colors.primary,
  padding: "24px",
  textAlign: "center" as const,
  borderRadius: "8px 8px 0 0",
};

const headerTitle = {
  color: colors.white,
  fontSize: "20px",
  fontWeight: "bold" as const,
  margin: 0,
};

const body = {
  padding: "24px",
  backgroundColor: colors.white,
};

const greeting = {
  color: colors.gray,
  fontSize: "16px",
  margin: "0 0 16px 0",
};

const paragraph = {
  color: colors.gray,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 24px 0",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "24px 0",
};

const button = {
  backgroundColor: colors.primary,
  color: colors.white,
  fontSize: "14px",
  fontWeight: "bold" as const,
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "6px",
  display: "inline-block" as const,
};

const fineprint = {
  color: colors.gray,
  fontSize: "12px",
  lineHeight: "18px",
  margin: "24px 0 0 0",
  fontStyle: "italic" as const,
};
