-- Milestone 5: management master data, role scopes, and immutable audit.
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint cities_code_format check (code ~ '^[A-Z0-9][A-Z0-9-]{1,15}$'),
  constraint cities_name_length check (char_length(name) between 2 and 100 and name = btrim(name))
);
create unique index cities_code_key on public.cities (code);
create unique index cities_name_key on public.cities (lower(name));

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete restrict,
  shop_number text not null,
  name text not null,
  address text,
  manager_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint shops_number_format check (shop_number ~ '^[A-Z0-9][A-Z0-9-]{0,15}$'),
  constraint shops_name_length check (char_length(name) between 2 and 120 and name = btrim(name)),
  constraint shops_address_length check (address is null or char_length(address) between 1 and 300),
  constraint shops_city_number_key unique (city_id, shop_number)
);
create index shops_manager_idx on public.shops (manager_id);

create table public.app_settings (
  id boolean primary key default true constraint app_settings_singleton check (id),
  low_stock_threshold integer not null,
  critical_stock_threshold integer not null,
  transfer_approval_required boolean not null,
  transfer_approval_min_quantity integer not null default 0,
  operating_open time not null,
  operating_close time not null,
  state_helpline text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint app_settings_low_range check (low_stock_threshold between 1 and 1000000),
  constraint app_settings_critical_range check (critical_stock_threshold >= 0),
  constraint app_settings_critical_below_low check (critical_stock_threshold < low_stock_threshold),
  constraint app_settings_min_qty check (transfer_approval_min_quantity between 0 and 1000000),
  constraint app_settings_hours check (operating_close > operating_open),
  constraint app_settings_helpline check (state_helpline ~ '^\+?[0-9][0-9 -]{5,18}[0-9]$')
);

create table public.master_data_audit_log (
  id bigint generated always as identity primary key,
  entity text not null,
  record_id text not null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index master_data_audit_created_idx on public.master_data_audit_log (created_at desc);

alter table public.user_roles
  add column scope_city_id uuid references public.cities(id) on delete restrict,
  add column scope_shop_id uuid references public.shops(id) on delete restrict;
create index user_roles_scope_city_idx on public.user_roles (scope_city_id) where scope_city_id is not null;
create index user_roles_scope_shop_idx on public.user_roles (scope_shop_id) where scope_shop_id is not null;
comment on column public.user_roles.scope_code is
  'Display label derived from scope_city_id/scope_shop_id; not authoritative';

alter table public.cities enable row level security;
alter table public.shops enable row level security;
alter table public.app_settings enable row level security;
alter table public.master_data_audit_log enable row level security;

grant select, insert, update, delete on public.cities to authenticated;
grant select, insert, update, delete on public.shops to authenticated;
grant select, insert, update on public.app_settings to authenticated;
grant select on public.master_data_audit_log to authenticated;
grant all on public.cities, public.shops, public.app_settings, public.master_data_audit_log to service_role;

create or replace function public.has_operational_access()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = (select auth.uid()) and p.is_active
  )
$$;

create or replace function public.current_scope_city_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(r.scope_city_id, s.city_id)
  from public.user_roles r
  join public.profiles p on p.id = r.user_id and p.is_active
  left join public.shops s on s.id = r.scope_shop_id
  where r.user_id = (select auth.uid())
$$;

create or replace function public.current_scope_shop_id()
returns uuid language sql stable security definer set search_path = public as $$
  select r.scope_shop_id
  from public.user_roles r
  join public.profiles p on p.id = r.user_id and p.is_active
  where r.user_id = (select auth.uid()) and r.role = 'shop_manager'
$$;

create policy "Scoped city reads" on public.cities for select to authenticated using (
  (select public.is_state_admin()) or (select public.has_role((select auth.uid()), 'auditor'))
  or id = (select public.current_scope_city_id())
);
create policy "Admin inserts cities" on public.cities for insert to authenticated with check ((select public.is_state_admin()));
create policy "Admin updates cities" on public.cities for update to authenticated using ((select public.is_state_admin())) with check ((select public.is_state_admin()));
create policy "Admin deletes cities" on public.cities for delete to authenticated using ((select public.is_state_admin()));

create policy "Scoped shop reads" on public.shops for select to authenticated using (
  (select public.is_state_admin()) or (select public.has_role((select auth.uid()), 'auditor'))
  or (((select public.has_role((select auth.uid()), 'district_manager'))
    or (select public.has_role((select auth.uid()), 'warehouse_manager')))
    and city_id = (select public.current_scope_city_id()))
  or id = (select public.current_scope_shop_id())
);
create policy "Admin inserts shops" on public.shops for insert to authenticated with check ((select public.is_state_admin()));
create policy "Admin updates shops" on public.shops for update to authenticated using ((select public.is_state_admin())) with check ((select public.is_state_admin()));
create policy "Admin deletes shops" on public.shops for delete to authenticated using ((select public.is_state_admin()));

create policy "Operational users read settings" on public.app_settings for select to authenticated using ((select public.has_operational_access()));
create policy "Admin creates settings" on public.app_settings for insert to authenticated with check ((select public.is_state_admin()));
create policy "Admin updates settings" on public.app_settings for update to authenticated using ((select public.is_state_admin())) with check ((select public.is_state_admin()));
create policy "Admin and auditor read master audit" on public.master_data_audit_log for select to authenticated using (
  (select public.is_state_admin()) or (select public.has_role((select auth.uid()), 'auditor'))
);

create or replace function public.stamp_master_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    if new.id is distinct from old.id then raise exception 'Record id cannot be changed'; end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end $$;

create or replace function public.normalize_city()
returns trigger language plpgsql set search_path = public as $$
begin
  new.code := upper(btrim(new.code));
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if tg_op = 'UPDATE' and old.is_active and not new.is_active
    and exists (select 1 from public.shops where city_id = new.id and is_active) then
    raise exception 'Deactivate this city''s shops before deactivating the city';
  end if;
  return new;
end $$;

create or replace function public.validate_shop()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.shop_number := upper(btrim(new.shop_number));
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.address := nullif(btrim(new.address), '');
  if new.is_active and not exists (select 1 from public.cities where id = new.city_id and is_active) then
    raise exception 'An active shop must belong to an active city';
  end if;
  if new.manager_id is not null and (tg_op = 'INSERT' or new.manager_id is distinct from old.manager_id)
    and not public.has_role(new.manager_id, 'shop_manager') then
    raise exception 'Shop manager must be an active user with the Shop Manager role';
  end if;
  return new;
end $$;

create or replace function public.normalize_settings()
returns trigger language plpgsql set search_path = public as $$
begin
  new.id := true;
  new.state_helpline := btrim(new.state_helpline);
  if not new.transfer_approval_required then new.transfer_approval_min_quantity := 0; end if;
  return new;
end $$;

create trigger cities_normalize before insert or update on public.cities for each row execute function public.normalize_city();
create trigger cities_stamp before insert or update on public.cities for each row execute function public.stamp_master_data();
create trigger shops_validate before insert or update on public.shops for each row execute function public.validate_shop();
create trigger shops_stamp before insert or update on public.shops for each row execute function public.stamp_master_data();
create trigger settings_normalize before insert or update on public.app_settings for each row execute function public.normalize_settings();
create trigger settings_stamp before insert or update on public.app_settings for each row execute function public.stamp_master_data();

create or replace function public.write_master_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.master_data_audit_log (entity, record_id, action, old_values, new_values, actor_id)
  values (tg_table_name, coalesce(new.id, old.id)::text, lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    coalesce((select auth.uid()), case when tg_op <> 'DELETE' then new.updated_by end));
  return null;
end $$;

create trigger cities_audit after insert or update or delete on public.cities for each row execute function public.write_master_audit();
create trigger shops_audit after insert or update or delete on public.shops for each row execute function public.write_master_audit();
create trigger settings_audit after insert or update on public.app_settings for each row execute function public.write_master_audit();

create or replace function public.block_audit_change()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Audit events are immutable';
end $$;
create trigger master_audit_immutable before update or delete on public.master_data_audit_log for each row execute function public.block_audit_change();
create trigger access_audit_immutable before update or delete on public.access_audit_log for each row execute function public.block_audit_change();

create or replace function public.guard_role_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare c_code text; s_label text;
begin
  if tg_op = 'DELETE' then
    if (select auth.uid()) is not null and old.user_id = (select auth.uid()) then
      raise exception 'You cannot remove your own role';
    end if;
    return old;
  end if;
  if new.role in ('district_manager', 'warehouse_manager') then
    new.scope_shop_id := null;
    if new.scope_city_id is null then raise exception 'This role requires a city'; end if;
    select code into c_code from public.cities where id = new.scope_city_id and is_active;
    if c_code is null then raise exception 'Assigned city must exist and be active'; end if;
    new.scope_code := c_code;
  elsif new.role = 'shop_manager' then
    new.scope_city_id := null;
    if new.scope_shop_id is null then raise exception 'This role requires a shop'; end if;
    select c.code || '/' || s.shop_number into s_label
      from public.shops s join public.cities c on c.id = s.city_id
      where s.id = new.scope_shop_id and s.is_active;
    if s_label is null then raise exception 'Assigned shop must exist and be active'; end if;
    new.scope_code := s_label;
  else
    new.scope_city_id := null;
    new.scope_shop_id := null;
    new.scope_code := null;
  end if;
  if tg_op = 'INSERT' then
    new.assigned_at := now();
    new.assigned_by := coalesce((select auth.uid()), new.assigned_by);
  else
    if new.user_id <> old.user_id then raise exception 'Role owner cannot be changed'; end if;
    if (select auth.uid()) is not null and old.user_id = (select auth.uid()) and new.role <> old.role then
      raise exception 'You cannot change your own role';
    end if;
    new.assigned_at := old.assigned_at;
    new.assigned_by := old.assigned_by;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by, new.assigned_by);
  return new;
end $$;

revoke execute on function public.stamp_master_data(), public.write_master_audit(), public.block_audit_change(),
  public.validate_shop(), public.normalize_city(), public.normalize_settings() from public, anon, authenticated;
revoke execute on function public.has_operational_access(), public.current_scope_city_id(), public.current_scope_shop_id() from public, anon;
grant execute on function public.has_operational_access(), public.current_scope_city_id(), public.current_scope_shop_id() to authenticated, service_role;
