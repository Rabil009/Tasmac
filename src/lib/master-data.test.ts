import { describe, expect, it } from "vitest";
import {
  citySchema,
  friendlyDbError,
  settingsSchema,
  shopSchema,
} from "./master-data";
import { scopeKind } from "./rbac";
import { inviteSchema } from "./users.functions";

const settings = {
  lowStockThreshold: 50,
  criticalStockThreshold: 10,
  transferApprovalRequired: true,
  transferApprovalMinQuantity: 100,
  operatingOpen: "10:00",
  operatingClose: "22:00",
  stateHelpline: "+91 44 2345 6789",
};
const uuid = "6f1c1d0e-8a5b-4c1e-9f2a-1b2c3d4e5f60";

describe("city validation", () => {
  it("normalizes the code to upper case", () => {
    expect(
      citySchema.parse({ code: " chn-01 ", name: " Chennai ", isActive: true })
        .code,
    ).toBe("CHN-01");
  });
  it("rejects malformed codes", () => {
    expect(
      citySchema.safeParse({ code: "a", name: "Chennai", isActive: true })
        .success,
    ).toBe(false);
    expect(
      citySchema.safeParse({ code: "CH N", name: "Chennai", isActive: true })
        .success,
    ).toBe(false);
  });
});

describe("shop validation", () => {
  it("requires a city", () => {
    const r = shopSchema.safeParse({
      cityId: "",
      shopNumber: "101",
      name: "Main",
      address: "",
      managerId: null,
      isActive: true,
    });
    expect(r.success).toBe(false);
  });
  it("normalizes the shop number", () => {
    const r = shopSchema.parse({
      cityId: uuid,
      shopNumber: " 12a ",
      name: "Main",
      address: "",
      managerId: null,
      isActive: true,
    });
    expect(r.shopNumber).toBe("12A");
  });
});

describe("settings validation", () => {
  it("accepts critical below low", () => {
    expect(settingsSchema.safeParse(settings).success).toBe(true);
  });
  it("rejects critical equal to low", () => {
    expect(
      settingsSchema.safeParse({ ...settings, criticalStockThreshold: 50 })
        .success,
    ).toBe(false);
  });
  it("rejects critical above low", () => {
    expect(
      settingsSchema.safeParse({ ...settings, criticalStockThreshold: 60 })
        .success,
    ).toBe(false);
  });
  it("rejects closing before opening", () => {
    expect(
      settingsSchema.safeParse({ ...settings, operatingClose: "09:00" })
        .success,
    ).toBe(false);
  });
  it("rejects an invalid helpline", () => {
    expect(
      settingsSchema.safeParse({ ...settings, stateHelpline: "call us" })
        .success,
    ).toBe(false);
  });
});

describe("role scope references master data", () => {
  it("shop managers are scoped to a shop", () => {
    expect(scopeKind("shop_manager")).toBe("shop");
    expect(scopeKind("state_admin")).toBeNull();
  });
  it("invite of a scoped role without a location is rejected", () => {
    const base = {
      email: "a@b.co",
      fullName: "Ann Lee",
      role: "shop_manager" as const,
      redirectTo: "https://x.y",
    };
    expect(inviteSchema.safeParse({ ...base, scopeId: null }).success).toBe(
      false,
    );
    expect(inviteSchema.safeParse({ ...base, scopeId: "SHOP-1" }).success).toBe(
      false,
    );
    expect(inviteSchema.safeParse({ ...base, scopeId: uuid }).success).toBe(
      true,
    );
  });
});

describe("database error mapping", () => {
  it("explains blocked city deletion", () => {
    expect(
      friendlyDbError({
        code: "23503",
        message: 'violates foreign key constraint "shops_city_id_fkey"',
      }),
    ).toMatch(/still has shops/);
  });
  it("explains permission denial", () => {
    expect(
      friendlyDbError({
        code: "42501",
        message: "new row violates row-level security",
      }),
    ).toMatch(/permission/);
  });
});
