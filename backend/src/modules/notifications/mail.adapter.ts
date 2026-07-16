import { env } from "../../config/env";
import { logger } from "../../lib/logger";

export type MailMessage = { to: string; subject: string; body: string };

/**
 * Thin mail adapter (02-Architecture.md, Section 2: "Email").
 * Swap the body of this function for AWS SES or Azure Communication
 * Services in production - see deployment/06-Deployment-AWS.md and
 * deployment/07-Deployment-Azure.md. Nothing else in the codebase should
 * import an email SDK directly; always go through sendMail().
 */
export async function sendMail(message: MailMessage): Promise<void> {
  if (env.mailProvider === "console" || env.nodeEnv !== "production") {
    // `body` is where activation tokens and temp passwords actually live
    // (see organization.service.ts/user.service.ts callers) - dropping it
    // here meant there was previously no way to retrieve them at all once
    // NODE_ENV=production also suppresses echoing them back in API
    // responses. This is the only place either value is ever exposed on a
    // deployment without a real mail provider configured.
    logger.info("Email (console adapter - not actually sent)", { to: message.to, subject: message.subject, body: message.body });
    return;
  }
  // Production providers plug in here, e.g.:
  // if (env.mailProvider === "ses") { ...call AWS SES SDK... }
  // if (env.mailProvider === "acs") { ...call Azure Communication Services SDK... }
  throw new Error(`Unsupported MAIL_PROVIDER: ${env.mailProvider}`);
}
