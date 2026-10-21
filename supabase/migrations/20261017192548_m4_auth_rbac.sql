CREATE TYPE public.app_role AS ENUM ('state_admin','district_manager','warehouse_manager','shop_manager','auditor');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  scope_code text,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
COMMENT ON COLUMN public.user_roles.scope_code IS 'District/warehouse/shop code; becomes a reference to master data in M5';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.access_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_user_id uuid NOT NULL,
  entity text NOT NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.access_audit_log TO authenticated;
GRANT ALL ON public.access_audit_log TO service_role;
ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id AND r.role = _role AND p.is_active)
$$;

CREATE OR REPLACE FUNCTION public.is_state_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'state_admin')
$$;

CREATE POLICY "Own profile or admin reads" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_state_admin());
CREATE POLICY "Admin updates profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_state_admin()) WITH CHECK (public.is_state_admin());

CREATE POLICY "Own role or admin reads" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_state_admin());
CREATE POLICY "Admin inserts roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_state_admin());
CREATE POLICY "Admin updates roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_state_admin()) WITH CHECK (public.is_state_admin());
CREATE POLICY "Admin deletes roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_state_admin());

CREATE POLICY "Admin and auditor read audit" ON public.access_audit_log FOR SELECT TO authenticated
  USING (public.is_state_admin() OR public.has_role(auth.uid(), 'auditor'));

-- Profile auto-creation (inactive until an administrator activates it)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NULLIF(NEW.raw_user_meta_data->>'full_name',''));
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Stamp audit fields from the real session; protect immutable columns and self-lockout
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.email <> OLD.email OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Profile id, email and created_at cannot be changed';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.id AND OLD.is_active AND NOT NEW.is_active THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

CREATE OR REPLACE FUNCTION public.guard_role_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NOT NULL AND OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'You cannot remove your own role';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.scope_code IS NOT NULL THEN
    NEW.scope_code := NULLIF(btrim(NEW.scope_code), '');
    IF length(NEW.scope_code) > 64 THEN RAISE EXCEPTION 'Scope code is too long'; END IF;
  END IF;
  IF NEW.role IN ('district_manager','warehouse_manager','shop_manager') AND NEW.scope_code IS NULL THEN
    RAISE EXCEPTION 'This role requires a scope code';
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
CREATE TRIGGER user_roles_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_role_write();

CREATE OR REPLACE FUNCTION public.write_access_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; actor uuid;
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    target := COALESCE(NEW.id, OLD.id);
    actor := COALESCE(auth.uid(), NEW.updated_by);
  ELSE
    target := COALESCE(NEW.user_id, OLD.user_id);
    actor := COALESCE(auth.uid(), CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.updated_by END);
  END IF;
  INSERT INTO public.access_audit_log (target_user_id, entity, action, old_values, new_values, actor_id)
  VALUES (target, TG_TABLE_NAME, lower(TG_OP),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END, actor);
  RETURN NULL;
END $$;
CREATE TRIGGER user_roles_audit AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.write_access_audit();
CREATE TRIGGER profiles_audit AFTER UPDATE ON public.profiles
  FOR EACH ROW WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.full_name IS DISTINCT FROM NEW.full_name)
  EXECUTE FUNCTION public.write_access_audit();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Trigger functions are internal. Helper execution is limited to signed-in identities.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_role_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_access_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_state_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_state_admin() TO authenticated;
