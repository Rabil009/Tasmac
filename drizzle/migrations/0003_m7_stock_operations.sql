CREATE TYPE public.movement_type AS ENUM ('receive','issue','adjust_surplus','adjust_writeoff');
CREATE TYPE public.adjust_reason AS ENUM ('audit_reconciliation','breakage','damage','expiry','other');

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  movement_type public.movement_type NOT NULL,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  delta integer NOT NULL,
  balance_before integer NOT NULL,
  balance_after integer NOT NULL,
  reference text NOT NULL,
  counterparty text,
  adjust_reason public.adjust_reason,
  justification text,
  idempotency_key uuid NOT NULL,
  actor_id uuid NOT NULL,
  actor_role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_qty_positive CHECK (quantity > 0 AND quantity <= 1000000),
  CONSTRAINT stock_movements_delta_sign CHECK (
    (movement_type IN ('receive','adjust_surplus') AND delta = quantity) OR
    (movement_type IN ('issue','adjust_writeoff') AND delta = -quantity)),
  CONSTRAINT stock_movements_balance CHECK (balance_after = balance_before + delta AND balance_before >= 0 AND balance_after >= 0),
  CONSTRAINT stock_movements_reference CHECK (char_length(reference) BETWEEN 3 AND 40),
  CONSTRAINT stock_movements_counterparty CHECK (counterparty IS NULL OR char_length(counterparty) BETWEEN 2 AND 120),
  CONSTRAINT stock_movements_adjust_fields CHECK (
    (movement_type IN ('adjust_surplus','adjust_writeoff')) = (adjust_reason IS NOT NULL AND justification IS NOT NULL)),
  CONSTRAINT stock_movements_justification CHECK (justification IS NULL OR char_length(justification) BETWEEN 20 AND 1000)
);
CREATE UNIQUE INDEX stock_movements_idem_key ON public.stock_movements (idempotency_key);
CREATE UNIQUE INDEX stock_movements_reference_key ON public.stock_movements (movement_type, shop_id, product_id, reference);
CREATE INDEX stock_movements_shop_idx ON public.stock_movements (shop_id, created_at DESC);
CREATE INDEX stock_movements_product_idx ON public.stock_movements (product_id, created_at DESC);
CREATE INDEX stock_movements_type_idx ON public.stock_movements (movement_type, created_at DESC);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped movement reads" ON public.stock_movements FOR SELECT TO authenticated USING (public.can_read_shop(shop_id));
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_change();

-- Explicitly ensure clients cannot write balances or movements directly.
REVOKE INSERT, UPDATE, DELETE ON public.shop_inventory FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.stock_movements FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.can_operate_shop(_shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_access() AND NOT public.has_role(auth.uid(), 'auditor') AND (
    public.is_state_admin()
    OR ((public.has_role(auth.uid(), 'district_manager') OR public.has_role(auth.uid(), 'warehouse_manager'))
        AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = _shop_id AND s.city_id = public.current_scope_city_id()))
    OR (public.has_role(auth.uid(), 'shop_manager') AND _shop_id = public.current_scope_shop_id()))
$$;
REVOKE EXECUTE ON FUNCTION public.can_operate_shop(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_operate_shop(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  _type public.movement_type, _shop_id uuid, _product_id uuid, _quantity integer, _reference text,
  _counterparty text, _reason public.adjust_reason, _justification text, _idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_city uuid;
  v_inv public.shop_inventory%ROWTYPE;
  v_delta integer;
  v_ref text := upper(btrim(coalesce(_reference, '')));
  v_cp text := NULLIF(btrim(regexp_replace(coalesce(_counterparty, ''), '\s+', ' ', 'g')), '');
  v_just text := NULLIF(btrim(coalesce(_justification, '')), '');
  v_mv public.stock_movements%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to record stock' USING ERRCODE = '42501'; END IF;
  IF _idempotency_key IS NULL THEN RAISE EXCEPTION 'Missing submission key'; END IF;

  SELECT * INTO v_mv FROM public.stock_movements WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF v_mv.actor_id <> v_uid THEN RAISE EXCEPTION 'Submission key already used' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('id', v_mv.id, 'txn_no', v_mv.txn_no, 'balance_after', v_mv.balance_after,
      'created_at', v_mv.created_at, 'replayed', true);
  END IF;

  IF NOT public.can_operate_shop(_shop_id) THEN
    RAISE EXCEPTION 'You are not authorized to record stock for this shop' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_uid;
  SELECT city_id INTO v_city FROM public.shops WHERE id = _shop_id AND is_active;
  IF v_city IS NULL THEN RAISE EXCEPTION 'Shop must exist and be active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND is_active) THEN
    RAISE EXCEPTION 'Product must exist and be active';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity > 1000000 THEN
    RAISE EXCEPTION 'Quantity must be a whole number between 1 and 1,000,000';
  END IF;
  IF v_ref !~ '^[A-Z0-9][A-Z0-9/-]{2,39}$' THEN RAISE EXCEPTION 'Reference must be 3–40 letters, digits, / or -'; END IF;
  IF _type IN ('receive','issue') AND (v_cp IS NULL OR char_length(v_cp) > 120 OR char_length(v_cp) < 2) THEN
    RAISE EXCEPTION 'Enter the source or destination (2–120 characters)';
  END IF;
  IF _type IN ('adjust_surplus','adjust_writeoff') THEN
    IF _reason IS NULL THEN RAISE EXCEPTION 'Select an adjustment reason'; END IF;
    IF v_just IS NULL OR char_length(v_just) < 20 OR char_length(v_just) > 1000 THEN
      RAISE EXCEPTION 'Justification must be 20–1000 characters';
    END IF;
    IF _type = 'adjust_surplus' AND _reason <> 'audit_reconciliation' THEN
      RAISE EXCEPTION 'Surplus adjustments must be audit reconciliations';
    END IF;
    v_cp := NULL;
  ELSE
    _reason := NULL; v_just := NULL;
  END IF;

  IF _type = 'receive' THEN
    INSERT INTO public.shop_inventory (shop_id, product_id) VALUES (_shop_id, _product_id)
      ON CONFLICT (shop_id, product_id) DO NOTHING;
  END IF;
  SELECT * INTO v_inv FROM public.shop_inventory WHERE shop_id = _shop_id AND product_id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock: this shop holds none of this product'; END IF;

  v_delta := CASE WHEN _type IN ('receive','adjust_surplus') THEN _quantity ELSE -_quantity END;
  IF v_inv.quantity_on_hand + v_delta < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: % available', v_inv.quantity_on_hand;
  END IF;

  UPDATE public.shop_inventory SET quantity_on_hand = quantity_on_hand + v_delta WHERE id = v_inv.id;

  INSERT INTO public.stock_movements (movement_type, shop_id, city_id, product_id, quantity, delta, balance_before,
    balance_after, reference, counterparty, adjust_reason, justification, idempotency_key, actor_id, actor_role)
  VALUES (_type, _shop_id, v_city, _product_id, _quantity, v_delta, v_inv.quantity_on_hand,
    v_inv.quantity_on_hand + v_delta, v_ref, v_cp, _reason, v_just, _idempotency_key, v_uid, v_role)
  RETURNING * INTO v_mv;

  RETURN jsonb_build_object('id', v_mv.id, 'txn_no', v_mv.txn_no, 'balance_after', v_mv.balance_after,
    'created_at', v_mv.created_at, 'replayed', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(public.movement_type, uuid, uuid, integer, text, text, public.adjust_reason, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.receive_stock(_shop_id uuid, _product_id uuid, _quantity integer,
  _challan_no text, _source text, _idempotency_key uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.apply_stock_movement('receive', _shop_id, _product_id, _quantity, _challan_no, _source, NULL, NULL, _idempotency_key)
$$;
CREATE OR REPLACE FUNCTION public.issue_stock(_shop_id uuid, _product_id uuid, _quantity integer,
  _register_ref text, _destination text, _idempotency_key uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.apply_stock_movement('issue', _shop_id, _product_id, _quantity, _register_ref, _destination, NULL, NULL, _idempotency_key)
$$;
CREATE OR REPLACE FUNCTION public.adjust_stock(_shop_id uuid, _product_id uuid, _direction text, _quantity integer,
  _reason public.adjust_reason, _audit_memo text, _justification text, _idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _direction NOT IN ('surplus','writeoff') THEN RAISE EXCEPTION 'Direction must be surplus or write-off'; END IF;
  RETURN public.apply_stock_movement(
    CASE WHEN _direction = 'surplus' THEN 'adjust_surplus'::public.movement_type ELSE 'adjust_writeoff'::public.movement_type END,
    _shop_id, _product_id, _quantity, _audit_memo, NULL, _reason, _justification, _idempotency_key);
END $$;
REVOKE EXECUTE ON FUNCTION public.receive_stock(uuid, uuid, integer, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.issue_stock(uuid, uuid, integer, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, text, integer, public.adjust_reason, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_stock(uuid, uuid, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_stock(uuid, uuid, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, text, integer, public.adjust_reason, text, text, uuid) TO authenticated;

CREATE VIEW public.stock_movement_log WITH (security_invoker = true) AS
SELECT m.id, m.txn_no, m.movement_type, m.shop_id, m.city_id, m.product_id, m.quantity, m.delta,
  m.balance_before, m.balance_after, m.reference, m.counterparty, m.adjust_reason, m.justification,
  m.actor_id, m.actor_role, m.created_at,
  p.sku, p.name AS product_name, s.shop_number, s.name AS shop_name, c.name AS city_name
FROM public.stock_movements m
JOIN public.products p ON p.id = m.product_id
JOIN public.shops s ON s.id = m.shop_id
JOIN public.cities c ON c.id = m.city_id;
GRANT SELECT ON public.stock_movement_log TO authenticated;
GRANT ALL ON public.stock_movement_log TO service_role;
