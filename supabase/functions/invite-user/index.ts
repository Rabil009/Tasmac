import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type InvitePayload = {
  email?: unknown;
  fullName?: unknown;
  role?: unknown;
  scopeId?: unknown;
  redirectTo?: unknown;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(["state_admin", "shop_manager"]);

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return response(405, { error: "Method not allowed." });

  const authorization = request.headers.get("Authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token) return response(401, { error: "Sign in again to invite a user." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole)
    return response(500, { error: "The invitation service is unavailable. Try again shortly." });

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const actor = userData.user;
  if (userError || !actor)
    return response(401, { error: "Sign in again to invite a user." });

  const [profile, role] = await Promise.all([
    admin.from("profiles").select("is_active").eq("id", actor.id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", actor.id).maybeSingle(),
  ]);
  if (profile.error || role.error)
    return response(500, { error: "Could not verify invitation permissions. Try again." });
  if (!profile.data?.is_active || role.data?.role !== "state_admin")
    return response(403, { error: "Only a State Administrator can invite users." });

  let input: InvitePayload;
  try {
    input = await request.json();
  } catch {
    return response(400, { error: "Invitation details are not valid." });
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const roleName = typeof input.role === "string" ? input.role : "";
  const scopeId = typeof input.scopeId === "string" ? input.scopeId : null;
  if (!EMAIL.test(email)) return response(400, { error: "Enter a valid email address." });
  if (fullName.length < 2 || fullName.length > 120)
    return response(400, { error: "Enter the user's full name." });
  if (!ROLES.has(roleName)) return response(400, { error: "Select a valid role." });
  if (roleName === "shop_manager" && (!scopeId || !UUID.test(scopeId)))
    return response(400, { error: "Select an assigned shop." });

  let redirectTo: string;
  try {
    const redirectUrl = new URL(String(input.redirectTo));
    if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") throw new Error();
    redirectTo = `${redirectUrl.origin}/reset-password`;
  } catch {
    return response(400, { error: "The invitation return address is not valid." });
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    { data: { full_name: fullName }, redirectTo },
  );
  if (inviteError || !invited.user) {
    const alreadyExists = inviteError?.message.toLowerCase().includes("already");
    return response(400, {
      error: alreadyExists
        ? "An account with this email already exists. Assign its role from the user list."
        : "The invitation could not be sent. Try again.",
    });
  }

  const userId = invited.user.id;
  const { error: profileError } = await admin
    .from("profiles")
    .update({ is_active: true, full_name: fullName, updated_by: actor.id })
    .eq("id", userId);
  if (profileError)
    return response(500, { error: "The user was invited but could not be activated." });

  const { error: roleError } = await admin.from("user_roles").upsert(
    {
      user_id: userId,
      role: roleName,
      scope_city_id: null,
      scope_shop_id: roleName === "shop_manager" ? scopeId : null,
      assigned_by: actor.id,
      updated_by: actor.id,
    },
    { onConflict: "user_id" },
  );
  if (roleError)
    return response(500, { error: "The user was invited but the role could not be saved." });

  return response(200, { userId });
});
