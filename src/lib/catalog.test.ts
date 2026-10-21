import { describe, expect, it } from "vitest";
import { deriveHealth, friendlyProductError, productSchema } from "./catalog";
import { canReadStatewide, canWriteCatalog } from "./rbac";
import { safeTerm } from "./inventory.queries";

const base = {
  sku: " imfl-750-001 ",
  name: " Sample  Whisky ",
  category: "imfl",
  brand: "B",
  manufacturer: "Maker Co",
  volumeMl: 750,
  packaging: "glass_bottle",
  unitsPerCase: 12,
  abvPercent: 42.8,
  mrp: 640,
  hsnCode: "",
  barcode: "",
  exciseRegistrationNo: "tn-ex-1",
  labelApprovalNo: "",
  isActive: true,
} as const;

describe("product validation", () => {
  it("normalizes SKU and blanks optional fields to null", () => {
    const v = productSchema.parse(base);
    expect(v.sku).toBe("IMFL-750-001");
    expect(v.name).toBe("Sample Whisky");
    expect(v.barcode).toBeNull();
    expect(v.exciseRegistrationNo).toBe("TN-EX-1");
  });
  it("rejects unknown category, bad ABV, zero MRP and short barcode", () => {
    expect(
      productSchema.safeParse({ ...base, category: "spirits" }).success,
    ).toBe(false);
    expect(productSchema.safeParse({ ...base, abvPercent: 81 }).success).toBe(
      false,
    );
    expect(productSchema.safeParse({ ...base, mrp: 0 }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, barcode: "1234" }).success).toBe(
      false,
    );
  });
  it("rejects volume below 50 ml", () => {
    expect(productSchema.safeParse({ ...base, volumeMl: 30 }).success).toBe(
      false,
    );
  });
});

describe("stock health", () => {
  const t = { low: 50, critical: 10 };
  it("critical at or below critical threshold", () =>
    expect(deriveHealth(10, t)).toBe("critical"));
  it("low at or below low threshold", () =>
    expect(deriveHealth(50, t)).toBe("low"));
  it("healthy above low threshold", () =>
    expect(deriveHealth(51, t)).toBe("healthy"));
  it("not configured without settings", () =>
    expect(deriveHealth(0, null)).toBe("not_configured"));
});

describe("catalog permissions", () => {
  it("only State Administrators write the catalog", () => {
    expect(canWriteCatalog("state_admin")).toBe(true);
    expect(canWriteCatalog("shop_manager")).toBe(false);
  });
  it("statewide reads are State Administrator-only", () => {
    expect(canReadStatewide("state_admin")).toBe(true);
    expect(canReadStatewide("shop_manager")).toBe(false);
  });
  it("maps stocked-product delete to a clear message", () => {
    expect(friendlyProductError({ code: "23503" })).toMatch(/Deactivate/);
  });
  it("strips filter-breaking characters from search", () => {
    expect(safeTerm("a,b(c)*")).toBe("a b c");
  });
});
