import { describe, expect, it } from "vitest";
import {
  availableActions,
  friendlyTransferError,
  nextStatus,
  rejectNoteSchema,
  transferRequestSchema,
  waybillSchema,
} from "./transfers";

const a = "6f1c1d0e-8a5b-4c1e-9f2a-1b2c3d4e5f60";
const b = "7f1c1d0e-8a5b-4c1e-9f2a-1b2c3d4e5f61";
const ctx = {
  role: "shop_manager" as const,
  userId: "u1",
  requestedBy: "u1",
  status: "requested" as const,
  canOperateSource: true,
  canOperateDest: false,
};

describe("transfer state machine", () => {
  it("follows requested → approved → dispatched → received", () => {
    expect(nextStatus("requested", "approve")).toBe("approved");
    expect(nextStatus("approved", "dispatch")).toBe("dispatched");
    expect(nextStatus("dispatched", "receive")).toBe("received");
  });
  it("blocks premature, repeated and invalid transitions", () => {
    expect(nextStatus("requested", "dispatch")).toBeNull();
    expect(nextStatus("approved", "approve")).toBeNull();
    expect(nextStatus("received", "receive")).toBeNull();
    expect(nextStatus("approved", "cancel")).toBeNull();
    expect(nextStatus("rejected", "approve")).toBeNull();
  });
});

describe("transfer permissions", () => {
  it("only State Administrators approve or reject", () => {
    expect(availableActions(ctx)).toEqual(["cancel"]);
    expect(
      availableActions({ ...ctx, role: "state_admin", requestedBy: "x" }),
    ).toEqual(["approve", "reject"]);
  });
  it("only the requester may cancel", () => {
    expect(availableActions({ ...ctx, requestedBy: "other" })).toEqual([]);
  });
  it("source dispatches, destination receives", () => {
    expect(availableActions({ ...ctx, status: "approved" })).toEqual([
      "dispatch",
    ]);
    expect(availableActions({ ...ctx, status: "dispatched" })).toEqual([]);
    expect(
      availableActions({ ...ctx, status: "dispatched", canOperateDest: true }),
    ).toEqual(["receive"]);
  });
  it("unassigned users are read-only", () => {
    expect(
      availableActions({ ...ctx, role: null, status: "approved" }),
    ).toEqual([]);
  });
});

describe("transfer validation", () => {
  const base = {
    sourceShopId: a,
    destShopId: b,
    productId: a,
    quantity: "12",
    reason: "Festival demand at destination",
  };
  it("accepts a valid request", () =>
    expect(transferRequestSchema.safeParse(base).success).toBe(true));
  it("rejects same-shop transfers", () =>
    expect(
      transferRequestSchema.safeParse({ ...base, destShopId: a }).success,
    ).toBe(false));
  it("rejects zero and fractional quantities", () => {
    expect(
      transferRequestSchema.safeParse({ ...base, quantity: "0" }).success,
    ).toBe(false);
    expect(
      transferRequestSchema.safeParse({ ...base, quantity: "1.5" }).success,
    ).toBe(false);
  });
  it("requires a reason", () =>
    expect(
      transferRequestSchema.safeParse({ ...base, reason: "  " }).success,
    ).toBe(false));
  it("requires a rejection note and valid waybill", () => {
    expect(rejectNoteSchema.safeParse("no").success).toBe(false);
    expect(waybillSchema.parse(" wb/001 ")).toBe("WB/001");
    expect(waybillSchema.safeParse("x").success).toBe(false);
  });
  it("sanitizes unknown errors", () =>
    expect(
      friendlyTransferError({ code: "XX000", message: "boom" }),
    ).not.toMatch(/boom/));
});
