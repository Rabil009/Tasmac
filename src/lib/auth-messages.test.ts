import { describe, expect, it } from "vitest";
import {
  EMAIL_SENT_NOTICE,
  authErrorMessage,
  cooldownRemaining,
} from "./auth-messages";

describe("auth messages", () => {
  it("maps rate limits to a wait message", () => {
    expect(
      authErrorMessage(
        { status: 429, message: "email rate limit exceeded" },
        "resend",
      ),
    ).toMatch(/Wait a few minutes/);
  });
  it("tells unconfirmed users to confirm, and hides other sign-in errors", () => {
    expect(
      authErrorMessage({ code: "email_not_confirmed", status: 400 }, "signin"),
    ).toMatch(/Confirm your email/);
    expect(
      authErrorMessage(
        { status: 400, message: "Invalid login credentials" },
        "signin",
      ),
    ).toBe("Invalid email or password.");
  });
  it("never echoes server text for email flows (no enumeration)", () => {
    const m = authErrorMessage(
      { status: 422, message: "User a@b.c already registered" },
      "signup",
    );
    expect(m).not.toMatch(/a@b\.c|registered/);
  });
  it("uses neutral success notices", () => {
    expect(EMAIL_SENT_NOTICE.forgot).toMatch(/^If an account exists/);
    expect(EMAIL_SENT_NOTICE.resend).toMatch(
      /^If an unconfirmed account exists/,
    );
  });
  it("enforces a 60 second cooldown", () => {
    expect(cooldownRemaining(1_000, 1_000)).toBe(60);
    expect(cooldownRemaining(1_000, 31_000)).toBe(30);
    expect(cooldownRemaining(1_000, 61_000)).toBe(0);
    expect(cooldownRemaining(undefined, 5)).toBe(0);
  });
});
