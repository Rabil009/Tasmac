# TASMAC Supabase setup

Supabase is the authoritative identity and data service. The complete operational schema is maintained in `drizzle/migrations/0000_m4_auth_rbac.sql` through `0007_m10_revoke_audit_writes.sql`; apply those files in filename order to a new TASMAC project. The old public showcase migration has been removed.

## First State Administrator

The application intentionally creates no users or credentials. The first administrator bootstrap is a one-time trusted backend action:

1. The real administrator selects **Request an account** on `/login` and confirms the email.
2. An authorized operator looks up that confirmed identity in `auth.users`.
3. In one database transaction, activate the matching `public.profiles` row and insert its `public.user_roles` row with role `state_admin`. Set `updated_by` and `assigned_by` to that same real user ID so the bootstrap remains attributable.
4. Sign in and use **Management → Users** for every later activation and role assignment.

Never add a bootstrap email, password, service-role key, or secret key to a migration or application environment file.

## Local application environment

Only the public Supabase values belong in the ignored `.env.local` file:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

PostgreSQL RLS remains the security boundary for the publishable key.
