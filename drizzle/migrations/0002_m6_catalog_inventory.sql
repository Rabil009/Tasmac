CREATE TYPE public.product_category AS ENUM ('imfl','beer','wine','rtd');
CREATE TYPE public.packaging_type AS ENUM ('glass_bottle','pet_bottle','can','tetra_pack','keg');

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  name text NOT NULL,
  category public.product_category NOT NULL,
  brand text NOT NULL,
  manufacturer text NOT NULL,
  volume_ml integer NOT NULL,
  packaging public.packaging_type NOT NULL,
  units_per_case integer NOT NULL,
  abv_percent numeric(4,2) NOT NULL,
  mrp numeric(10,2) NOT NULL,
  hsn_code text,
  barcode text,
  excise_registration_no text NOT NULL,
  label_approval_no text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT products_sku_format CHECK (sku ~ '^[A-Z0-9][A-Z0-9-]{2,23}$'),
  CONSTRAINT products_name_length CHECK (char_length(name) BETWEEN 2 AND 150 AND name = btrim(name)),
  CONSTRAINT products_brand_length CHECK (char_length(brand) BETWEEN 1 AND 100),
  CONSTRAINT products_manufacturer_length CHECK (char_length(manufacturer) BETWEEN 2 AND 150),
  CONSTRAINT products_volume_range CHECK (volume_ml BETWEEN 50 AND 50000),
  CONSTRAINT products_units_range CHECK (units_per_case BETWEEN 1 AND 500),
  CONSTRAINT products_abv_range CHECK (abv_percent >= 0 AND abv_percent <= 80),
  CONSTRAINT products_mrp_range CHECK (mrp > 0 AND mrp <= 10000000),
  CONSTRAINT products_hsn_format CHECK (hsn_code IS NULL OR hsn_code ~ '^[0-9]{4,8}$'),
  CONSTRAINT products_barcode_format CHECK (barcode IS NULL OR barcode ~ '^[0-9]{8,14}$'),
  CONSTRAINT products_excise_length CHECK (char_length(excise_registration_no) BETWEEN 3 AND 40),
  CONSTRAINT products_label_length CHECK (label_approval_no IS NULL OR char_length(label_approval_no) BETWEEN 3 AND 40)
);
CREATE UNIQUE INDEX products_sku_key ON public.products (sku);
CREATE UNIQUE INDEX products_barcode_key ON public.products (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX products_category_idx ON public.products (category);
CREATE INDEX products_name_idx ON public.products (lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shop_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_on_hand integer NOT NULL DEFAULT 0,
  safety_minimum integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT shop_inventory_qty_nonneg CHECK (quantity_on_hand >= 0),
  CONSTRAINT shop_inventory_min_nonneg CHECK (safety_minimum >= 0),
  CONSTRAINT shop_inventory_shop_product_key UNIQUE (shop_id, product_id)
);
CREATE INDEX shop_inventory_product_idx ON public.shop_inventory (product_id);
GRANT SELECT ON public.shop_inventory TO authenticated;
GRANT ALL ON public.shop_inventory TO service_role;
ALTER TABLE public.shop_inventory ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_shop(_shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_access() AND (
    public.is_state_admin() OR public.has_role(auth.uid(), 'auditor')
    OR ((public.has_role(auth.uid(), 'district_manager') OR public.has_role(auth.uid(), 'warehouse_manager'))
        AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = _shop_id AND s.city_id = public.current_scope_city_id()))
    OR _shop_id = public.current_scope_shop_id())
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_shop(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_shop(uuid) TO authenticated;

CREATE POLICY "Operational users read catalog" ON public.products FOR SELECT TO authenticated USING (public.has_operational_access());
CREATE POLICY "Admin inserts products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_state_admin());
CREATE POLICY "Admin updates products" ON public.products FOR UPDATE TO authenticated USING (public.is_state_admin()) WITH CHECK (public.is_state_admin());
CREATE POLICY "Admin deletes products" ON public.products FOR DELETE TO authenticated USING (public.is_state_admin());
CREATE POLICY "Scoped inventory reads" ON public.shop_inventory FOR SELECT TO authenticated USING (public.can_read_shop(shop_id));

CREATE OR REPLACE FUNCTION public.normalize_product()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.sku := upper(btrim(NEW.sku));
  NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  NEW.brand := btrim(regexp_replace(NEW.brand, '\s+', ' ', 'g'));
  NEW.manufacturer := btrim(regexp_replace(NEW.manufacturer, '\s+', ' ', 'g'));
  NEW.excise_registration_no := upper(btrim(NEW.excise_registration_no));
  NEW.label_approval_no := NULLIF(upper(btrim(NEW.label_approval_no)), '');
  NEW.hsn_code := NULLIF(btrim(NEW.hsn_code), '');
  NEW.barcode := NULLIF(btrim(NEW.barcode), '');
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.normalize_product() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER products_normalize BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.normalize_product();
CREATE TRIGGER products_stamp BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.stamp_master_data();
CREATE TRIGGER products_audit AFTER INSERT OR UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.write_master_audit();
CREATE TRIGGER shop_inventory_stamp BEFORE INSERT OR UPDATE ON public.shop_inventory FOR EACH ROW EXECUTE FUNCTION public.stamp_master_data();
CREATE TRIGGER shop_inventory_audit AFTER INSERT OR UPDATE OR DELETE ON public.shop_inventory FOR EACH ROW EXECUTE FUNCTION public.write_master_audit();

CREATE VIEW public.inventory_status WITH (security_invoker = true) AS
SELECT i.id, i.shop_id, i.product_id, i.quantity_on_hand, i.safety_minimum, i.updated_at,
  p.sku, p.name AS product_name, p.category, p.volume_ml, p.packaging,
  s.shop_number, s.name AS shop_name, s.city_id, c.code AS city_code, c.name AS city_name,
  CASE
    WHEN st.id IS NULL THEN 'not_configured'
    WHEN i.quantity_on_hand <= st.critical_stock_threshold THEN 'critical'
    WHEN i.quantity_on_hand <= st.low_stock_threshold THEN 'low'
    ELSE 'healthy'
  END AS health
FROM public.shop_inventory i
JOIN public.products p ON p.id = i.product_id
JOIN public.shops s ON s.id = i.shop_id
JOIN public.cities c ON c.id = s.city_id
LEFT JOIN public.app_settings st ON st.id;
GRANT SELECT ON public.inventory_status TO authenticated;
GRANT ALL ON public.inventory_status TO service_role;
