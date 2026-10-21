-- Enforce the two-role access model at the database boundary.
-- A Shop Manager can read only their assigned shop; State Administrators read statewide.
create or replace function public.has_operational_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.is_active
    where r.user_id = auth.uid()
      and r.role in ('state_admin'::public.app_role, 'shop_manager'::public.app_role)
  );
$$;

create or replace function public.is_state_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.is_active
    where r.user_id = auth.uid()
      and r.role = 'state_admin'::public.app_role
  );
$$;

create or replace function public.current_scope_shop_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.scope_shop_id
  from public.user_roles r
  join public.profiles p on p.id = r.user_id and p.is_active
  where r.user_id = auth.uid()
    and r.role = 'shop_manager'::public.app_role;
$$;

create or replace function public.can_read_shop(_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_operational_access()
    and (public.is_state_admin() or _shop_id = public.current_scope_shop_id());
$$;

drop policy if exists "Scoped shop reads" on public.shops;
create policy "Scoped shop reads" on public.shops
for select to authenticated
using (public.is_state_admin() or id = public.current_scope_shop_id());

drop policy if exists "Scoped city reads" on public.cities;
create policy "Scoped city reads" on public.cities
for select to authenticated
using (
  public.is_state_admin()
  or id in (
    select s.city_id from public.shops s
    where s.id = public.current_scope_shop_id()
  )
);
