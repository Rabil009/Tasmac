import { supabase } from "@/integrations/supabase/client";

export interface City {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  updated_at: string;
}
export interface Shop {
  id: string;
  city_id: string;
  shop_number: string;
  name: string;
  address: string | null;
  manager_id: string | null;
  is_active: boolean;
  updated_at: string;
}
export interface ShopManagerOption {
  id: string;
  label: string;
}

export async function fetchCities(): Promise<City[]> {
  const { data, error } = await supabase
    .from("cities")
    .select("id, code, name, is_active, updated_at")
    .order("name");
  if (error) throw new Error("Cities could not be loaded.");
  return data;
}

export async function fetchShops(): Promise<Shop[]> {
  const { data, error } = await supabase
    .from("shops")
    .select(
      "id, city_id, shop_number, name, address, manager_id, is_active, updated_at",
    )
    .order("shop_number");
  if (error) throw new Error("Shops could not be loaded.");
  return data;
}

/** Active profiles holding the Shop Manager role (visible to State Administrators only). */
export async function fetchShopManagers(): Promise<ShopManagerOption[]> {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "shop_manager");
  if (error) throw new Error("Shop managers could not be loaded.");
  const ids = roles.map((r) => r.user_id);
  if (ids.length === 0) return [];
  const { data: profs, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ids)
    .eq("is_active", true)
    .order("email");
  if (pErr) throw new Error("Shop managers could not be loaded.");
  return profs.map((p) => ({
    id: p.id,
    label: p.full_name ? `${p.full_name} (${p.email})` : p.email,
  }));
}
