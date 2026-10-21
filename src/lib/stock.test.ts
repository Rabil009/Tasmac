import { describe, expect, it } from "vitest";
import {
  adjustSchema,
  friendlyStockError,
  issueSchema,
  projectBalance,
  receiveSchema,
  stockDelta,
} from "./stock";

const uuid = "6f1c1d0e-8a5b-4c1e-9f2a-1b2c3d4e5f60";
const base = {
  shopId: uuid,
  productId: uuid,
  quantity: "24",
  reference: " dc/2026-001 ",
  counterparty: " Chennai  Depot ",
};

describe("receive and issue validation", () => {
  it("normalizes the challan reference and counterparty", () => {
    const v = receiveSchema.parse(base);
    expect(v.reference).toBe("DC/2026-001");
    expect(v.counterparty).toBe("Chennai Depot");
    expect(v.quantity).toBe(24);
  });
  it("rejects zero, negative and fractional quantities", () => {
    for (const q of ["0", "-5", "2.5"])
      expect(receiveSchema.safeParse({ ...base, quantity: q }).success).toBe(
        false,
      );
  });
  it("requires a sales register reference for issues", () => {
    expect(issueSchema.safeParse({ ...base, reference: "" }).success).toBe(
      false,
    );
  });
});

describe("adjustment validation", () => {
  const adj = {
    ...base,
    direction: "writeoff",
    reason: "breakage",
    justification: "Three bottles broken during unloading",
  };
  it("accepts a breakage write-off with justification", () =>
    expect(adjustSchema.safeParse(adj).success).toBe(true));
  it("rejects a justification under 20 characters", () =>
    expect(
      adjustSchema.safeParse({ ...adj, justification: "broken" }).success,
    ).toBe(false));
  it("surplus must be an audit reconciliation", () => {
    expect(
      adjustSchema.safeParse({ ...adj, direction: "surplus" }).success,
    ).toBe(false);
    expect(
      adjustSchema.safeParse({
        ...adj,
        direction: "surplus",
        reason: "audit_reconciliation",
      }).success,
    ).toBe(true);
  });
});

describe("balance projection", () => {
  it("receive increments, issue and write-off decrement, surplus increments", () => {
    expect(stockDelta("receive", 10)).toBe(10);
    expect(stockDelta("issue", 10)).toBe(-10);
    expect(stockDelta("adjust", 10, "writeoff")).toBe(-10);
    expect(stockDelta("adjust", 10, "surplus")).toBe(10);
  });
  it("projects insufficient stock as negative", () =>
    expect(projectBalance(5, -6)).toBe(-1));
});

describe("error sanitizing", () => {
  it("maps duplicate references", () =>
    expect(
      friendlyStockError({
        code: "23505",
        message: "stock_movements_reference_key",
      }),
    ).toMatch(/already been recorded/));
  it("passes through database validation messages", () =>
    expect(
      friendlyStockError({
        code: "P0001",
        message: "Insufficient stock: 4 available",
      }),
    ).toBe("Insufficient stock: 4 available"));
  it("hides unknown errors", () =>
    expect(
      friendlyStockError({ code: "XX000", message: "internal" }),
    ).not.toMatch(/internal/));
});
