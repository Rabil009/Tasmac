import {
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/shell/app-shell";
import { FullPageLoading, FullPageState } from "@/components/shell/states";
import { BackendUnavailableError, loadAccess, signOut } from "@/lib/access";
import { hasOperationalAccess } from "@/lib/rbac";
import { Button } from "@4rged-ai/platform";
import { RetryButton } from "@/components/stock/ops-bits";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      if (
        error &&
        error.status !== 401 &&
        error.status !== 403 &&
        error.name !== "AuthSessionMissingError"
      ) {
        throw new BackendUnavailableError();
      }
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    const access = await loadAccess(data.user.id, data.user.email ?? "");
    return { access };
  },
  pendingComponent: () => <FullPageLoading />,
  errorComponent: BackendError,
  component: AuthenticatedLayout,
});

function BackendError() {
  const router = useRouter();
  return (
    <FullPageState
      tone="error"
      title="Service unavailable"
      description="The TASMAC service could not be reached. Check your connection and try again."
      action={<RetryButton onClick={() => router.invalidate()} />}
    />
  );
}

function AuthenticatedLayout() {
  const { access } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!hasOperationalAccess(access)) {
    return (
      <FullPageState
        title="Access pending"
        description={`You are signed in as ${access.email}, but your account has not been activated or assigned a role yet. A State Administrator must approve your access before you can use TASMAC.`}
        action={
          <Button
            size="lg"
            variant="outline"
            className="tasmac-btn tasmac-btn-toolbar"
            onClick={async () => {
              queryClient.clear();
              await signOut();
              navigate({ to: "/login", replace: true });
            }}
          >
            Sign out
          </Button>
        }
      />
    );
  }

  return (
    <AppShell access={access}>
      <Outlet />
    </AppShell>
  );
}
