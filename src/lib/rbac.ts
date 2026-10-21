export const APP_ROLES = [
  "state_admin",
  "shop_manager",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  state_admin: "State Administrator",
  shop_manager: "Shop Manager",
};

/** Shop Managers are limited to their assigned shop. */
export const SCOPED_ROLES: readonly AppRole[] = ["shop_manager"];

export function roleRequiresScope(role: AppRole): boolean {
  return SCOPED_ROLES.includes(role);
}

/** Which master-data record a role's scope must reference. */
export function scopeKind(
  role: AppRole | "" | null | undefined,
): "city" | "shop" | null {
  if (role === "shop_manager") return "shop";
  return null;
}

/** Converts a database role value into one of the two roles supported by TASMAC. */
export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export type SectionId =
  "dashboard" | "inventory" | "stock" | "tracking" | "reports" | "management";

const ALL: readonly AppRole[] = APP_ROLES;

export const SECTION_ACCESS: Record<SectionId, readonly AppRole[]> = {
  dashboard: ALL,
  inventory: ALL,
  stock: ALL,
  tracking: ALL,
  reports: ALL,
  management: ["state_admin"],
};

export function canAccess(
  role: AppRole | null | undefined,
  section: SectionId,
): boolean {
  if (!role) return false;
  return SECTION_ACCESS[section].includes(role);
}

export interface NavChild {
  id: string;
  label: string;
  href: string;
}

export interface NavItem {
  id: SectionId;
  label: string;
  href: string;
  children?: readonly NavChild[];
}

export const NAVIGATION: readonly NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "inventory", label: "Inventory", href: "/inventory" },
  {
    id: "stock",
    label: "Stock",
    href: "/stock/receive",
    children: [
      { id: "receive-stock", label: "Receive Stock", href: "/stock/receive" },
      { id: "issue-stock", label: "Issue Stock", href: "/stock/issue" },
      {
        id: "transfer-stock",
        label: "Transfer Stock",
        href: "/stock/transfer",
      },
      { id: "adjust-stock", label: "Adjust Stock", href: "/stock/adjust" },
    ],
  },
  { id: "tracking", label: "Tracking", href: "/tracking" },
  { id: "reports", label: "Reports", href: "/reports" },
  {
    id: "management",
    label: "Management",
    href: "/management/cities",
    children: [
      { id: "cities", label: "Cities", href: "/management/cities" },
      { id: "shops", label: "Shops", href: "/management/shops" },
      { id: "users", label: "Users", href: "/management/users" },
    ],
  },
];

export function navigationForRole(
  role: AppRole | null | undefined,
): readonly NavItem[] {
  return NAVIGATION.filter((item) => canAccess(role, item.id));
}

export function titleForPath(pathname: string): string {
  for (const item of NAVIGATION) {
    const child = item.children?.find((c) => c.href === pathname);
    if (child) return child.label;
    if (item.href === pathname) return item.label;
  }
  return "TASMAC Inventory";
}

export interface AccessState {
  userId: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  role: AppRole | null;
  scopeCode: string | null;
}

/** An account may use operational screens only when active and assigned a role. */
export function hasOperationalAccess(
  access: AccessState | null | undefined,
): boolean {
  return Boolean(access && access.isActive && isAppRole(access.role));
}

/** Catalog writes are State Administrator-only in M6 (mirrors products RLS). */
export function canWriteCatalog(role: AppRole | null | undefined): boolean {
  return role === "state_admin";
}

/** State Administrators can read the complete statewide inventory. */
export function canReadStatewide(role: AppRole | null | undefined): boolean {
  return role === "state_admin";
}

/**
 * Keeps existing shop controls visually unchanged while limiting a Shop
 * Manager's choices to the shop assigned in their access record.
 */
export function shopsWithinAccess<T extends { shop_number: string | null }>(
  role: AppRole | null | undefined,
  scopeCode: string | null | undefined,
  shops: readonly T[],
): T[] {
  if (role !== "shop_manager") return [...shops];
  if (!scopeCode) return [];
  return shops.filter((shop) => shop.shop_number === scopeCode);
}
