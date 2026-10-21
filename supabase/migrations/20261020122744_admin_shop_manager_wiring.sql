-- TASMAC currently has exactly two operational roles:
-- State Administrator (statewide) and Shop Manager (one assigned shop).

create or replace function public.guard_role_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $role_guard$
declare
  shop_label text;
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and old.user_id = auth.uid() then
      raise exception 'You cannot remove your own role';
    end if;
    return old;
  end if;

  if new.role = 'state_admin' then
    new.scope_city_id := null;
    new.scope_shop_id := null;
    new.scope_code := null;
  elsif new.role = 'shop_manager' then
    new.scope_city_id := null;
    if new.scope_shop_id is null then
      raise exception 'A Shop Manager must be assigned to one active shop';
    end if;
    select c.code || '/' || s.shop_number
      into shop_label
      from public.shops s
      join public.cities c on c.id = s.city_id
      where s.id = new.scope_shop_id
        and s.is_active
        and c.is_active;
    if shop_label is null then
      raise exception 'Assigned shop must exist and be active';
    end if;
    new.scope_code := shop_label;
  else
    raise exception 'Only State Administrator and Shop Manager roles are supported';
  end if;

  if tg_op = 'INSERT' then
    new.assigned_at := now();
    new.assigned_by := coalesce(auth.uid(), new.assigned_by);
  else
    if new.user_id <> old.user_id then
      raise exception 'Role owner cannot be changed';
    end if;
    if auth.uid() is not null and old.user_id = auth.uid() and new.role <> old.role then
      raise exception 'You cannot change your own role';
    end if;
    new.assigned_at := old.assigned_at;
    new.assigned_by := old.assigned_by;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by, new.assigned_by);
  return new;
end;
$role_guard$;

create unique index if not exists user_roles_one_manager_per_shop
  on public.user_roles (scope_shop_id)
  where role = 'shop_manager'::public.app_role;

-- user_roles is the source of truth. Keep the shop record in sync for the
-- management screen and prevent the same manager or shop from drifting apart.
create or replace function public.sync_shop_manager_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $manager_sync$
begin
  if tg_op in ('UPDATE', 'DELETE')
    and old.role = 'shop_manager'::public.app_role
    and old.scope_shop_id is not null then
    perform set_config('app.syncing_shop_manager', 'on', true);
    update public.shops
      set manager_id = null
      where id = old.scope_shop_id
        and manager_id = old.user_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and new.role = 'shop_manager'::public.app_role then
    perform set_config('app.syncing_shop_manager', 'on', true);
    update public.shops
      set manager_id = new.user_id
      where id = new.scope_shop_id;
  end if;

  return null;
end;
$manager_sync$;

drop trigger if exists user_roles_sync_shop_manager on public.user_roles;
create trigger user_roles_sync_shop_manager
after insert or update or delete on public.user_roles
for each row execute function public.sync_shop_manager_assignment();

create or replace function public.validate_shop()
returns trigger
language plpgsql
security definer
set search_path = public
as $shop_validation$
begin
  new.shop_number := upper(btrim(new.shop_number));
  new.name := btrim(regexp_replace(new.name, '\\s+', ' ', 'g'));
  new.address := nullif(btrim(new.address), '');

  if new.is_active and not exists (
    select 1 from public.cities where id = new.city_id and is_active
  ) then
    raise exception 'An active shop must belong to an active city';
  end if;

  if new.manager_id is distinct from (case when tg_op = 'INSERT' then null::uuid else old.manager_id end)
    and coalesce(current_setting('app.syncing_shop_manager', true), '') <> 'on' then
    raise exception 'Assign a Shop Manager from Management > Users';
  end if;

  if new.manager_id is not null
    and not public.has_role(new.manager_id, 'shop_manager') then
    raise exception 'Shop manager must be an active user with the Shop Manager role';
  end if;

  return new;
end;
$shop_validation$;

create or replace function public.can_operate_shop(_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $shop_access$
  select public.has_operational_access()
    and (
      public.is_state_admin()
      or _shop_id = public.current_scope_shop_id()
    );
$shop_access$;

create or replace function public.list_transfer_destinations()
returns table(id uuid, label text, city_id uuid)
language sql
stable
security definer
set search_path = public
as $transfer_destinations$
  select s.id, c.code || ' / ' || s.shop_number || ' · ' || s.name, s.city_id
  from public.shops s
  join public.cities c on c.id = s.city_id
  where s.is_active
    and c.is_active
    and public.has_operational_access()
  order by c.code, s.shop_number;
$transfer_destinations$;

-- This procedure is the only application write path for changing an existing
-- user's access. It validates the calling administrator and makes the profile,
-- role, and manager assignment update part of one transaction.
create or replace function public.admin_set_user_access(
  _user_id uuid,
  _role public.app_role,
  _scope_shop_id uuid,
  _is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $set_user_access$
begin
  if auth.uid() is null or not public.is_state_admin() then
    raise exception 'Only a State Administrator can change user access'
      using errcode = '42501';
  end if;
  if _user_id = auth.uid() then
    raise exception 'You cannot change your own access'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = _user_id) then
    raise exception 'User account was not found';
  end if;
  if _role is not null and _role not in ('state_admin'::public.app_role, 'shop_manager'::public.app_role) then
    raise exception 'Only State Administrator and Shop Manager roles are supported';
  end if;
  if _role = 'shop_manager'::public.app_role and _scope_shop_id is null then
    raise exception 'Select an assigned shop for the Shop Manager';
  end if;
  if _role <> 'shop_manager'::public.app_role and _scope_shop_id is not null then
    raise exception 'Only Shop Managers may have an assigned shop';
  end if;
  if _role = 'shop_manager'::public.app_role and not _is_active then
    raise exception 'A Shop Manager account must be active';
  end if;

  -- Activate first so the role synchronisation may validly attach the manager.
  if _is_active then
    update public.profiles
      set is_active = true
      where id = _user_id;
  end if;

  if _role is null then
    delete from public.user_roles where user_id = _user_id;
  else
    insert into public.user_roles (
      user_id, role, scope_city_id, scope_shop_id, assigned_by, updated_by
    ) values (
      _user_id,
      _role,
      null,
      case when _role = 'shop_manager'::public.app_role then _scope_shop_id else null end,
      auth.uid(),
      auth.uid()
    )
    on conflict (user_id) do update
      set role = excluded.role,
          scope_city_id = excluded.scope_city_id,
          scope_shop_id = excluded.scope_shop_id,
          updated_by = auth.uid();
  end if;

  if not _is_active then
    update public.profiles
      set is_active = false
      where id = _user_id;
  end if;

  return jsonb_build_object('user_id', _user_id);
end;
$set_user_access$;

revoke all on function public.sync_shop_manager_assignment() from public, anon, authenticated;
revoke all on function public.admin_set_user_access(uuid, public.app_role, uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_access(uuid, public.app_role, uuid, boolean) to authenticated, service_role;


