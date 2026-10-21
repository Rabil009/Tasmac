-- ===== Master data tables =====
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT cities_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,15}$'),
  CONSTRAINT cities_name_length CHECK (char_length(name) BETWEEN 2 AND 100 AND name = btrim(name))
);
CREATE UNIQUE INDEX cities_code_key ON public.cities (code);
CREATE UNIQUE INDEX cities_name_key ON public.cities (lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cities TO authenticated;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  shop_number text NOT NULL,
  name text NOT NULL,
  address text,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT shops_number_format CHECK (shop_number ~ '^[A-Z0-9][A-Z0-9-]{0,15}$'),
  CONSTRAINT shops_name_length CHECK (char_length(name) BETWEEN 2 AND 120 AND name = btrim(name)),
  CONSTRAINT shops_address_length CHECK (address IS NULL OR char_length(address) BETWEEN 1 AND 300),
  CONSTRAINT shops_city_number_key UNIQUE (city_id, shop_number)
);
CREATE INDEX shops_manager_idx ON public.shops (manager_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops TO authenticated;
GRANT ALL ON public.shops TO service_role;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CONSTRAINT app_settings_singleton CHECK (id),
  low_stock_threshold integer NOT NULL,
  critical_stock_threshold integer NOT NULL,
  transfer_approval_required boolean NOT NULL,
  transfer_approval_min_quantity integer NOT NULL DEFAULT 0,
  operating_open time NOT NULL,
  operating_close time NOT NULL,
  state_helpline text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT app_settings_low_range CHECK (low_stock_threshold BETWEEN 1 AND 1000000),
  CONSTRAINT app_settings_critical_range CHECK (critical_stock_threshold >= 0),
  CONSTRAINT app_settings_critical_below_low CHECK (critical_stock_threshold < low_stock_threshold),
  CONSTRAINT app_settings_min_qty CHECK (transfer_approval_min_quantity BETWEEN 0 AND 1000000),
  CONSTRAINT app_settings_hours CHECK (operating_close > operating_open),
  CONSTRAINT app_settings_helpline CHECK (state_helpline ~ '^\+?[0-9][0-9 -]{5,18}[0-9]$')
);
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.master_data_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.master_data_audit_log TO authenticated;
GRANT ALL ON public.master_data_audit_log TO service_role;
ALTER TABLE public.master_data_audit_log ENABLE ROW LEVEL SECURITY;

-- ===== Role scope references real master data =====
ALTER TABLE public.user_roles
  ADD COLUMN scope_city_id uuid REFERENCES public.cities(id) ON DELETE RESTRICT,
  ADD COLUMN scope_shop_id uuid REFERENCES public.shops(id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.user_roles.scope_code IS 'Display label derived from scope_city_id/scope_shop_id; not authoritative';

-- ===== Scope helpers =====
CREATE OR REPLACE FUNCTION public.has_operational_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = auth.uid() AND p.is_active)
$$;

CREATE OR REPLACE FUNCTION public.current_scope_city_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(r.scope_city_id, s.city_id)
  FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id AND p.is_active
  LEFT JOIN public.shops s ON s.id = r.scope_shop_id
  WHERE r.user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_scope_shop_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.scope_shop_id FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id AND p.is_active
  WHERE r.user_id = auth.uid() AND r.role = 'shop_manager'
$$;

-- ===== Policies =====
CREATE POLICY "Scoped city reads" ON public.cities FOR SELECT TO authenticated USING (
  public.is_state_admin() OR public.has_role(auth.uid(), 'auditor') OR id = public.current_scope_city_id());
CREATE POLICY "Admin inserts cities" ON public.cities FOR INSERT TO authenticated WITH CHECK (public.is_state_admin());
CREATE POLICY "Admin updates cities" ON public.cities FOR UPDATE TO authenticated USING (public.is_state_admin()) WITH CHECK (public.is_state_admin());
CREATE POLICY "Admin deletes cities" ON public.cities FOR DELETE TO authenticated USING (public.is_state_admin());

CREATE POLICY "Scoped shop reads" ON public.shops FOR SELECT TO authenticated USING (
  public.is_state_admin() OR public.has_role(auth.uid(), 'auditor')
  OR ((public.has_role(auth.uid(), 'district_manager') OR public.has_role(auth.uid(), 'warehouse_manager'))
      AND city_id = public.current_scope_city_id())
  OR id = public.current_scope_shop_id());
CREATE POLICY "Admin inserts shops" ON public.shops FOR INSERT TO authenticated WITH CHECK (public.is_state_admin());
CREATE POLICY "Admin updates shops" ON public.shops FOR UPDATE TO authenticated USING (public.is_state_admin()) WITH CHECK (public.is_state_admin());
CREATE POLICY "Admin deletes shops" ON public.shops FOR DELETE TO authenticated USING (public.is_state_admin());

CREATE POLICY "Operational users read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.has_operational_access());
CREATE POLICY "Admin creates settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.is_state_admin());
CREATE POLICY "Admin updates settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.is_state_admin()) WITH CHECK (public.is_state_admin());

CREATE POLICY "Admin and auditor read master audit" ON public.master_data_audit_log FOR SELECT TO authenticated
  USING (public.is_state_admin() OR public.has_role(auth.uid(), 'auditor'));

-- ===== Audit field stamping and normalization =====
CREATE OR REPLACE FUNCTION public.stamp_master_data()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Record id cannot be changed'; END IF;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.normalize_city()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.code := upper(btrim(NEW.code));
  NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  IF TG_OP = 'UPDATE' AND OLD.is_active AND NOT NEW.is_active
     AND EXISTS (SELECT 1 FROM public.shops WHERE city_id = NEW.id AND is_active) THEN
    RAISE EXCEPTION 'Deactivate this city''s shops before deactivating the city';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_shop()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.shop_number := upper(btrim(NEW.shop_number));
  NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  NEW.address := NULLIF(btrim(NEW.address), '');
  IF NEW.is_active AND NOT EXISTS (SELECT 1 FROM public.cities WHERE id = NEW.city_id AND is_active) THEN
    RAISE EXCEPTION 'An active shop must belong to an active city';
  END IF;
  IF NEW.manager_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.manager_id IS DISTINCT FROM OLD.manager_id)
     AND NOT public.has_role(NEW.manager_id, 'shop_manager') THEN
    RAISE EXCEPTION 'Shop manager must be an active user with the Shop Manager role';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.normalize_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.id := true;
  NEW.state_helpline := btrim(NEW.state_helpline);
  IF NOT NEW.transfer_approval_required THEN NEW.transfer_approval_min_quantity := 0; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER cities_normalize BEFORE INSERT OR UPDATE ON public.cities FOR EACH ROW EXECUTE FUNCTION public.normalize_city();
CREATE TRIGGER cities_stamp BEFORE INSERT OR UPDATE ON public.cities FOR EACH ROW EXECUTE FUNCTION public.stamp_master_data();
CREATE TRIGGER shops_validate BEFORE INSERT OR UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.validate_shop();
CREATE TRIGGER shops_stamp BEFORE INSERT OR UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.stamp_master_data();
CREATE TRIGGER settings_normalize BEFORE INSERT OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.normalize_settings();
CREATE TRIGGER settings_stamp BEFORE INSERT OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.stamp_master_data();

-- ===== Immutable audit events =====
CREATE OR REPLACE FUNCTION public.write_master_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.master_data_audit_log (entity, record_id, action, old_values, new_values, actor_id)
  VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id)::text, lower(TG_OP),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
    COALESCE(auth.uid(), CASE WHEN TG_OP <> 'DELETE' THEN NEW.updated_by END));
  RETURN NULL;
END $$;
CREATE TRIGGER cities_audit AFTER INSERT OR UPDATE OR DELETE ON public.cities FOR EACH ROW EXECUTE FUNCTION public.write_master_audit();
CREATE TRIGGER shops_audit AFTER INSERT OR UPDATE OR DELETE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.write_master_audit();
CREATE TRIGGER settings_audit AFTER INSERT OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.write_master_audit();

CREATE OR REPLACE FUNCTION public.block_audit_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are immutable';
END $$;
CREATE TRIGGER master_audit_immutable BEFORE UPDATE OR DELETE ON public.master_data_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_change();
CREATE TRIGGER access_audit_immutable BEFORE UPDATE OR DELETE ON public.access_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_change();

-- ===== Role scope now validated against master data =====
CREATE OR REPLACE FUNCTION public.guard_role_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c_code text; s_label text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NOT NULL AND OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'You cannot remove your own role';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.role IN ('district_manager','warehouse_manager') THEN
    NEW.scope_shop_id := NULL;
    IF NEW.scope_city_id IS NULL THEN RAISE EXCEPTION 'This role requires a city'; END IF;
    SELECT code INTO c_code FROM public.cities WHERE id = NEW.scope_city_id AND is_active;
    IF c_code IS NULL THEN RAISE EXCEPTION 'Assigned city must exist and be active'; END IF;
    NEW.scope_code := c_code;
  ELSIF NEW.role = 'shop_manager' THEN
    NEW.scope_city_id := NULL;
    IF NEW.scope_shop_id IS NULL THEN RAISE EXCEPTION 'This role requires a shop'; END IF;
    SELECT c.code || '/' || s.shop_number INTO s_label FROM public.shops s JOIN public.cities c ON c.id = s.city_id
      WHERE s.id = NEW.scope_shop_id AND s.is_active;
    IF s_label IS NULL THEN RAISE EXCEPTION 'Assigned shop must exist and be active'; END IF;
    NEW.scope_code := s_label;
  ELSE
    NEW.scope_city_id := NULL;
    NEW.scope_shop_id := NULL;
    NEW.scope_code := NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.assigned_at := now();
    NEW.assigned_by := COALESCE(auth.uid(), NEW.assigned_by);
  ELSE
    IF NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'Role owner cannot be changed'; END IF;
    IF auth.uid() IS NOT NULL AND OLD.user_id = auth.uid() AND NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'You cannot change your own role';
    END IF;
    NEW.assigned_at := OLD.assigned_at;
    NEW.assigned_by := OLD.assigned_by;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by, NEW.assigned_by);
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.stamp_master_data(), public.write_master_audit(), public.block_audit_change(),
  public.validate_shop(), public.normalize_city(), public.normalize_settings() FROM PUBLIC, anon, authenticated;
