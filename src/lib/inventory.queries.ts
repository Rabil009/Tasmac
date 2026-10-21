import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { PAGE_SIZE, type Category, type Health } from "./catalog";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type InventoryRow =
  Database["public"]["Views"]["inventory_status"]["Row"];

export type InventorySort = "name" | "sku" | "quantity" | "category";
export interface InventoryQuery {
  q: string;
  category: Category | "";
  health: Health | "" | "alerts";
  sort: InventorySort;
  dir: "asc" | "desc";
  page: number;
}

const SORT_COL: Record<InventorySort, string> = {
  name: "product_name",
  sku: "sku",
  quantity: "quantity_on_hand",
  category: "category",
};

/** Strips characters that would break a PostgREST or() filter. */
export const safeTerm = (q: string) =>
  q
    .replace(/[,()*%\\]/g, " ")
    .trim()
    .slice(0, 80);

export async function fetchInventory(
  p: InventoryQuery,
): Promise<{ rows: InventoryRow[]; total: number }> {
  let req = supabase.from("inventory_status").select("*", { count: "exact" });
  const term = safeTerm(p.q);
  if (term)
    req = req.or(
      `product_name.ilike.*${term}*,sku.ilike.*${term}*,shop_name.ilike.*${term}*,shop_number.ilike.*${term}*`,
    );
  if (p.category) req = req.eq("category", p.category);
  if (p.health === "alerts") req = req.in("health", ["low", "critical"]);
  else if (p.health) req = req.eq("health", p.health);
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, error, count } = await req
    .order(SORT_COL[p.sort], { ascending: p.dir === "asc" })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Inventory could not be loaded.");
  return { rows: data ?? [], total: count ?? 0 };
}

async function countHealth(h: Health | null): Promise<number> {
  let req = supabase
    .from("inventory_status")
    .select("id", { count: "exact", head: true });
  if (h) req = req.eq("health", h);
  const { count, error } = await req;
  if (error) throw new Error("Stock alerts could not be loaded.");
  return count ?? 0;
}

export async function fetchAlertMetrics() {
  const [total, low, critical] = await Promise.all([
    countHealth(null),
    countHealth("low"),
    countHealth("critical"),
  ]);
  return { total, low, critical };
}

export async function fetchThresholds(): Promise<{
  low: number;
  critical: number;
} | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("low_stock_threshold, critical_stock_threshold")
    .maybeSingle();
  if (error) throw new Error("Settings could not be loaded.");
  return data
    ? { low: data.low_stock_threshold, critical: data.critical_stock_threshold }
    : null;
}

export async function fetchProducts(p: {
  q: string;
  category: Category | "";
  page: number;
}) {
  let req = supabase.from("products").select("*", { count: "exact" });
  const term = safeTerm(p.q);
  if (term)
    req = req.or(
      `name.ilike.*${term}*,sku.ilike.*${term}*,brand.ilike.*${term}*`,
    );
  if (p.category) req = req.eq("category", p.category);
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, error, count } = await req
    .order("name")
    .order("id")
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Products could not be loaded.");
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchProduct(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Product could not be loaded.");
  return data;
}

/** RLS limits rows to the caller's statewide, city or shop scope. */
export async function fetchDistribution(
  productId: string,
): Promise<InventoryRow[]> {
  const { data, error } = await supabase
    .from("inventory_status")
    .select("*")
    .eq("product_id", productId)
    .order("city_name")
    .order("shop_number");
  if (error) throw new Error("Distribution could not be loaded.");
  return data ?? [];
}
