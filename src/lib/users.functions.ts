import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APP_ROLES, roleRequiresScope } from "./rbac";

export const inviteSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email address")
      .max(255),
    fullName: z.string().trim().min(2, "Enter the user's full name").max(120),
    role: z.enum(APP_ROLES),
    scopeId: z
      .string()
      .uuid("Select a valid location")
      .nullable()
      .default(null),
    redirectTo: z.string().url(),
  })
  .refine((v) => !roleRequiresScope(v.role) || v.scopeId !== null, {
    message: "This role requires an assigned shop",
    path: ["scopeCode"],
  });

export type InviteInput = z.input<typeof inviteSchema>;

export const updateAccessSchema = z
  .object({
    userId: z.string().uuid("Invalid user"),
    role: z.enum(APP_ROLES).nullable(),
    scopeId: z.string().uuid("Select a valid shop").nullable(),
    isActive: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "shop_manager" && !value.scopeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scopeId"],
        message: "Select an assigned shop",
      });
    }
    if (value.role !== "shop_manager" && value.scopeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scopeId"],
        message: "Only Shop Managers can have an assigned shop",
      });
    }
    if (value.role === "shop_manager" && !value.isActive) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isActive"],
        message: "A Shop Manager account must be active",
      });
    }
  });

export type UpdateAccessInput = z.input<typeof updateAccessSchema>;

/**
 * Invites a user by email and provisions their role. Only an active State
 * Administrator may call it. The privileged work is isolated in the protected
 * Supabase Edge Function, so no service-role secret is needed by this app.
 */
export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: InviteInput) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
      "has_role",
      {
        _user_id: context.userId,
        _role: "state_admin",
      },
    );
    if (roleErr)
      throw new Error("Could not verify your permissions. Try again.");
    if (!isAdmin)
      throw new Error("Only a State Administrator can invite users.");

    const { data: invited, error } = await context.supabase.functions.invoke(
      "invite-user",
      { body: data },
    );
    if (error) {
      const detail = await functionErrorMessage(error);
      throw new Error(detail ?? "The invitation could not be sent. Try again.");
    }
    if (!isInviteResult(invited))
      throw new Error("The invitation could not be confirmed. Try again.");
    return invited;
  });

function isInviteResult(value: unknown): value is { userId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "userId" in value &&
    typeof value.userId === "string"
  );
}

async function functionErrorMessage(error: unknown): Promise<string | undefined> {
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return undefined;
  const payload = (await context.clone().json().catch(() => undefined)) as
    | { error?: unknown }
    | undefined;
  return typeof payload?.error === "string" ? payload.error : undefined;
}

/** Changes an existing user's role and shop scope through the audited database procedure. */
export const updateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateAccessInput) => updateAccessSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "admin_set_user_access",
      // Supabase's generated RPC types do not retain nullable PostgreSQL
      // function parameters, while this procedure deliberately accepts null
      // to remove an assignment or clear a State Administrator's shop scope.
      {
        _user_id: data.userId,
        _role: data.role,
        _scope_shop_id: data.scopeId,
        _is_active: data.isActive,
      } as never,
    );
    if (error) throw new Error(error.message);
    return result;
  });
