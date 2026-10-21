import { supabase } from "@/integrations/supabase/client";
import { isAppRole, type AccessState } from "./rbac";

export class BackendUnavailableError extends Error {
  constructor(message = "The TASMAC service could not be reached.") {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

/** Loads the signed-in user's profile and role. RLS returns only the caller's own rows. */
export async function loadAccess(
  userId: string,
  email: string,
): Promise<AccessState> {
  const [profileRes, roleRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, is_active")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("role, scope_code")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (profileRes.error || roleRes.error) {
    throw new BackendUnavailableError();
  }
  return {
    userId,
    email,
    fullName: profileRes.data?.full_name ?? null,
    isActive: profileRes.data?.is_active ?? false,
    role: isAppRole(roleRes.data?.role) ? roleRes.data.role : null,
    scopeCode: roleRes.data?.scope_code ?? null,
  };
}

let manualSignOut = false;

export function consumeManualSignOut(): boolean {
  const v = manualSignOut;
  manualSignOut = false;
  return v;
}

export async function signOut() {
  manualSignOut = true;
  await supabase.auth.signOut();
}
