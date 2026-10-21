/**
 * Sanitized, enumeration-safe auth feedback. Never echoes server text, emails or tokens.
 */
export const EMAIL_COOLDOWN_SECONDS = 60;

export type EmailAction = "signup" | "resend" | "forgot";

/** Neutral success text: identical whether or not an account exists or is already confirmed. */
export const EMAIL_SENT_NOTICE: Record<EmailAction, string> = {
  signup:
    "If this email can be registered, a confirmation link is on its way. Already have an account? Sign in, or use Forgot password.",
  resend:
    "If an unconfirmed account exists for that email, a new confirmation link has been sent. Check spam, and wait a minute before trying again.",
  forgot:
    "If an account exists for that email, a reset link has been sent. Check spam, and wait a minute before trying again.",
};

interface AuthErr {
  message?: string | undefined;
  status?: number | undefined;
  code?: string | undefined;
}

export function authErrorMessage(
  err: AuthErr | null | undefined,
  action: "signin" | EmailAction,
): string {
  const msg = (err?.message ?? "").toLowerCase();
  const code = (err?.code ?? "").toLowerCase();
  if (!err) return "Something went wrong. Try again.";
  if (err.status === 0 || /fetch|network/.test(msg)) {
    return "The TASMAC service could not be reached. Check your connection and try again.";
  }
  if (
    err.status === 429 ||
    code.includes("rate_limit") ||
    /rate limit|too many|security purposes/.test(msg)
  ) {
    return "Too many email or sign-in attempts. Wait a few minutes before trying again.";
  }
  if (action === "signin") {
    if (code === "email_not_confirmed" || msg.includes("not confirmed")) {
      return "Confirm your email address before signing in. You can resend the confirmation email below.";
    }
    return "Invalid email or password.";
  }
  if (code === "weak_password" || msg.includes("password")) {
    return "Choose a stronger password (at least 8 characters, not commonly used).";
  }
  // Any other email-flow failure stays neutral so it cannot reveal whether an account exists.
  return "The email could not be sent right now. Try again later.";
}

/** Seconds remaining before another email may be requested. */
export function cooldownRemaining(
  lastSentAt: number | undefined,
  now: number,
  seconds = EMAIL_COOLDOWN_SECONDS,
): number {
  if (!lastSentAt) return 0;
  return Math.max(0, Math.ceil((lastSentAt + seconds * 1000 - now) / 1000));
}
