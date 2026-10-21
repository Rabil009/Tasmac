import { describe, expect, it } from "vitest";
import {
  AppError,
  GENERIC_MESSAGE,
  REDACTED,
  normalizeError,
  sanitizeContext,
  userMessage,
} from "./app-error";

describe("error normalization", () => {
  it("keeps AppError messages", () =>
    expect(
      userMessage(new AppError("validation", "Quantity must be positive")),
    ).toBe("Quantity must be positive"));
  it("keeps short friendly messages", () =>
    expect(userMessage(new Error("Inventory could not be loaded."))).toBe(
      "Inventory could not be loaded.",
    ));
  it("hides raw constraint text", () =>
    expect(
      userMessage({
        code: "23514",
        message: 'new row for relation "shops" violates check constraint',
      }),
    ).toBe("Some values are not valid. Check the form and try again."));
  it("maps RLS denials to permission", () => {
    const e = normalizeError({
      code: "42501",
      message: "permission denied for table shop_inventory",
    });
    expect(e.kind).toBe("permission");
    expect(e.message).not.toMatch(/shop_inventory/);
  });
  it("maps network failures", () =>
    expect(normalizeError(new TypeError("Failed to fetch")).kind).toBe(
      "network",
    ));
  it("hides stack-like and URL text", () =>
    expect(
      userMessage(new Error("at foo (https://x.supabase.co/a.js:1:2)")),
    ).toBe(GENERIC_MESSAGE));
});

describe("context sanitization", () => {
  it("redacts sensitive keys recursively", () => {
    const out = sanitizeContext({
      password: "p",
      nested: {
        access_token: "t",
        Authorization: "Bearer x",
        cookie: "c",
        ok: 1,
      },
      list: [{ email: "a@b.in" }],
    });
    expect(out).toEqual({
      password: REDACTED,
      nested: {
        access_token: REDACTED,
        Authorization: REDACTED,
        cookie: REDACTED,
        ok: 1,
      },
      list: [{ email: REDACTED }],
    });
  });
  it("redacts identifiers inside free text", () => {
    const s = sanitizeContext(
      "user ravi@tn.gov.in token eyJabc.def.ghi phone 9876543210 key sb_secret_abc123",
    ) as string;
    expect(s).not.toMatch(/ravi@|eyJabc|9876543210|sb_secret_abc123/);
  });
  it("survives cycles", () => {
    const a: Record<string, unknown> = { n: 1 };
    a["self"] = a;
    expect(sanitizeContext(a)).toEqual({ n: 1, self: "[Circular]" });
  });
});
