import { z } from "zod";

/** Client-side mirrors of the database constraints. The database stays the authority. */

export const normalizeCode = (v: string) => v.trim().toUpperCase();
const collapse = (v: string) => v.trim().replace(/\s+/g, " ");

export const citySchema = z.object({
  code: z
    .string()
    .transform(normalizeCode)
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9][A-Z0-9-]{1,15}$/,
          "Code must be 2–16 letters, digits or hyphens",
        ),
    ),
  name: z
    .string()
    .transform(collapse)
    .pipe(
      z.string().min(2, "Enter the city name").max(100, "Name is too long"),
    ),
  isActive: z.boolean(),
});
export type CityInput = z.input<typeof citySchema>;

export const shopSchema = z.object({
  cityId: z.string().uuid("Select a city"),
  shopNumber: z
    .string()
    .transform(normalizeCode)
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9][A-Z0-9-]{0,15}$/,
          "Shop number must be 1–16 letters, digits or hyphens",
        ),
    ),
  name: z
    .string()
    .transform(collapse)
    .pipe(
      z.string().min(2, "Enter the shop name").max(120, "Name is too long"),
    ),
  address: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(300, "Address is too long")),
  managerId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});
export type ShopInput = z.input<typeof shopSchema>;

const timeRe = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const settingsSchema = z
  .object({
    lowStockThreshold: z.coerce
      .number({ invalid_type_error: "Enter a whole number" })
      .int("Enter a whole number")
      .min(1, "Must be at least 1")
      .max(1_000_000, "Too large"),
    criticalStockThreshold: z.coerce
      .number({ invalid_type_error: "Enter a whole number" })
      .int("Enter a whole number")
      .min(0, "Cannot be negative"),
    transferApprovalRequired: z.boolean(),
    transferApprovalMinQuantity: z.coerce
      .number({ invalid_type_error: "Enter a whole number" })
      .int("Enter a whole number")
      .min(0, "Cannot be negative")
      .max(1_000_000, "Too large"),
    operatingOpen: z.string().regex(timeRe, "Enter a time"),
    operatingClose: z.string().regex(timeRe, "Enter a time"),
    stateHelpline: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9 -]{5,18}[0-9]$/, "Enter a valid phone number"),
  })
  .refine((v) => v.criticalStockThreshold < v.lowStockThreshold, {
    message: "Critical threshold must be lower than the low-stock threshold",
    path: ["criticalStockThreshold"],
  })
  .refine((v) => v.operatingClose.slice(0, 5) > v.operatingOpen.slice(0, 5), {
    message: "Closing time must be after opening time",
    path: ["operatingClose"],
  });
export type SettingsInput = z.input<typeof settingsSchema>;

/** Returns the first message per field. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    out[k] ??= i.message;
  }
  return out;
}

/** Translates database errors into user-facing text. */
export function friendlyDbError(
  e: { code?: string; message?: string } | null | undefined,
): string {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "23505") {
    if (msg.includes("cities_code_key"))
      return "A city with this code already exists.";
    if (msg.includes("cities_name_key"))
      return "A city with this name already exists.";
    if (msg.includes("shops_city_number_key"))
      return "This shop number is already used in that city.";
    return "This record already exists.";
  }
  if (code === "23503") {
    if (msg.includes("shops_city_id_fkey"))
      return "This city still has shops. Remove or move them first.";
    if (msg.includes("user_roles"))
      return "Users are assigned to this record. Reassign them first.";
    return "This record is still in use and cannot be deleted.";
  }
  if (code === "23514") {
    if (msg.includes("critical_below_low"))
      return "Critical threshold must be lower than the low-stock threshold.";
    if (msg.includes("hours"))
      return "Closing time must be after opening time.";
    return "One or more values are invalid.";
  }
  if (code === "42501")
    return "You do not have permission to make this change.";
  if (code === "P0001" && msg) return msg;
  return "The change could not be saved. Try again.";
}
