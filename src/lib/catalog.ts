import { z } from "zod";
import { normalizeCode } from "./master-data";

/** Client-side mirrors of the products constraints. PostgreSQL stays the authority. */

export const CATEGORIES = ["imfl", "beer", "wine", "rtd"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  imfl: "IMFL",
  beer: "Beer",
  wine: "Wine",
  rtd: "RTD",
};

export const PACKAGING = [
  "glass_bottle",
  "pet_bottle",
  "can",
  "tetra_pack",
  "keg",
] as const;
export type Packaging = (typeof PACKAGING)[number];
export const PACKAGING_LABELS: Record<Packaging, string> = {
  glass_bottle: "Glass bottle",
  pet_bottle: "PET bottle",
  can: "Can",
  tetra_pack: "Tetra pack",
  keg: "Keg",
};

export const HEALTH = ["critical", "low", "healthy", "not_configured"] as const;
export type Health = (typeof HEALTH)[number];
export const HEALTH_LABELS: Record<Health, string> = {
  critical: "Critical",
  low: "Low",
  healthy: "Healthy",
  not_configured: "Not configured",
};

/** Mirrors the inventory_status view CASE expression (used only for tests and labels). */
export function deriveHealth(
  qty: number,
  t: { low: number; critical: number } | null,
): Health {
  if (!t) return "not_configured";
  if (qty <= t.critical) return "critical";
  if (qty <= t.low) return "low";
  return "healthy";
}

const collapse = (v: string) => v.trim().replace(/\s+/g, " ");
const optional = (re: RegExp, msg: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().refine((v) => v === "" || re.test(v), msg))
    .transform((v) => (v === "" ? null : v));

export const productSchema = z.object({
  sku: z
    .string()
    .transform(normalizeCode)
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9][A-Z0-9-]{2,23}$/,
          "SKU must be 3–24 letters, digits or hyphens",
        ),
    ),
  name: z
    .string()
    .transform(collapse)
    .pipe(
      z.string().min(2, "Enter the product name").max(150, "Name is too long"),
    ),
  category: z.enum(CATEGORIES, {
    errorMap: () => ({ message: "Select a category" }),
  }),
  brand: z
    .string()
    .transform(collapse)
    .pipe(z.string().min(1, "Enter the brand").max(100, "Brand is too long")),
  manufacturer: z
    .string()
    .transform(collapse)
    .pipe(
      z
        .string()
        .min(2, "Enter the manufacturer")
        .max(150, "Manufacturer is too long"),
    ),
  volumeMl: z.coerce
    .number({ invalid_type_error: "Enter a whole number" })
    .int("Enter a whole number")
    .min(50, "At least 50 ml")
    .max(50000, "At most 50,000 ml"),
  packaging: z.enum(PACKAGING, {
    errorMap: () => ({ message: "Select a packaging type" }),
  }),
  unitsPerCase: z.coerce
    .number({ invalid_type_error: "Enter a whole number" })
    .int("Enter a whole number")
    .min(1, "At least 1")
    .max(500, "At most 500"),
  abvPercent: z.coerce
    .number({ invalid_type_error: "Enter a number" })
    .min(0, "Cannot be negative")
    .max(80, "At most 80%")
    .refine((v) => Math.round(v * 100) === v * 100, "Use at most two decimals"),
  mrp: z.coerce
    .number({ invalid_type_error: "Enter an amount" })
    .gt(0, "Must be greater than zero")
    .max(10_000_000, "Too large")
    .refine(
      (v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6,
      "Use at most two decimals",
    ),
  hsnCode: optional(/^[0-9]{4,8}$/, "HSN code must be 4–8 digits"),
  barcode: optional(/^[0-9]{8,14}$/, "Barcode must be 8–14 digits"),
  exciseRegistrationNo: z
    .string()
    .transform(normalizeCode)
    .pipe(
      z
        .string()
        .min(3, "Enter the excise registration number")
        .max(40, "Too long"),
    ),
  labelApprovalNo: z
    .string()
    .transform(normalizeCode)
    .pipe(
      z
        .string()
        .refine(
          (v) => v === "" || (v.length >= 3 && v.length <= 40),
          "Must be 3–40 characters",
        ),
    )
    .transform((v) => (v === "" ? null : v)),
  isActive: z.boolean(),
});
export type ProductInput = z.input<typeof productSchema>;

export function friendlyProductError(
  e: { code?: string; message?: string } | null | undefined,
): string {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "23505") {
    if (msg.includes("products_sku_key"))
      return "A product with this SKU already exists.";
    if (msg.includes("products_barcode_key"))
      return "Another product already uses this barcode.";
    return "This product already exists.";
  }
  if (code === "23503")
    return "This product is stocked in a shop and cannot be deleted. Deactivate it instead.";
  if (code === "23514") return "One or more values are invalid.";
  if (code === "42501")
    return "You do not have permission to make this change.";
  return "The change could not be saved. Try again.";
}

export const PAGE_SIZE = 8;
