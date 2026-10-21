import { describe, expect, it } from "vitest";
import {
  canAccess,
  hasOperationalAccess,
  navigationForRole,
  roleRequiresScope,
  shopsWithinAccess,
} from "./rbac";

const base = { userId: "u", email: "a@b.c", fullName: null, scopeCode: null };

describe("RBAC rules", () => {
  it("Management is State Administrator only", () => {
    expect(canAccess("state_admin", "management")).toBe(true);
    expect(canAccess("shop_manager", "management")).toBe(false);
  });

  it("Shop Manager can open stock operations", () => {
    expect(canAccess("shop_manager", "stock")).toBe(true);
  });

  it("no role means no access anywhere", () => {
    expect(canAccess(null, "dashboard")).toBe(false);
    expect(navigationForRole(null)).toHaveLength(0);
  });

  it("navigation never exceeds six sections", () => {
    expect(navigationForRole("state_admin")).toHaveLength(6);
    expect(
      navigationForRole("shop_manager").some((i) => i.id === "management"),
    ).toBe(false);
  });

  it("inactive or unassigned accounts are access pending", () => {
    expect(
      hasOperationalAccess({ ...base, isActive: false, role: "shop_manager" }),
    ).toBe(false);
    expect(hasOperationalAccess({ ...base, isActive: true, role: null })).toBe(
      false,
    );
    expect(hasOperationalAccess({ ...base, isActive: true, role: "state_admin" })).toBe(true);
  });

  it("only Shop Manager requires a scope", () => {
    expect(roleRequiresScope("shop_manager")).toBe(true);
    expect(roleRequiresScope("state_admin")).toBe(false);
  });

  it("limits Shop Manager controls to the assigned shop", () => {
    const shops = [
      { shop_number: "CBE-001", name: "Central" },
      { shop_number: "CHN-001", name: "North" },
    ];
    expect(shopsWithinAccess("shop_manager", "CHN-001", shops)).toEqual([
      { shop_number: "CHN-001", name: "North" },
    ]);
    expect(shopsWithinAccess("state_admin", null, shops)).toEqual(shops);
  });
});
