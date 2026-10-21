import { sanitizeContext } from "@/lib/app-error";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Button, ThemeProvider, Toaster } from "@4rged-ai/platform";
import { supabase } from "@/integrations/supabase/client";
import { consumeManualSignOut } from "@/lib/access";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

// Mirrors 4RGE's pre-hydration theme bootstrap without importing its Next-only helper.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('fp-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.classList.toggle('light',!d);document.documentElement.style.colorScheme=d?'dark':'light';document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;

function NotFoundComponent() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="tasmac-page-title tabular-nums text-foreground">404</h1>
        <h2 className="mt-2 tasmac-section-title text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Button size="lg" className="tasmac-btn tasmac-btn-primary" asChild>
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(sanitizeContext(error));
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main
      role="alert"
      className="flex min-h-dvh items-center justify-center bg-background px-4"
    >
      <div className="max-w-md text-center">
        <h1 className="tasmac-page-title text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back
          home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            size="lg"
            variant="outline"
            className="tasmac-btn tasmac-btn-retry"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            <RotateCcw aria-hidden />
            Try again
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="tasmac-btn tasmac-btn-toolbar"
            asChild
          >
            <a href="/">Go home</a>
          </Button>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "TASMAC Inventory" },
        {
          name: "description",
          content: "TASMAC inventory and stock tracking application.",
        },
        { property: "og:title", content: "TASMAC Inventory" },
        {
          property: "og:description",
          content: "TASMAC inventory and stock tracking application.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
        },
        { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The 4RGE AppShell mounts its own Toaster inside authenticated screens.
  const shellOwnsToaster = !["/", "/login", "/reset-password"].includes(
    pathname,
  );

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED"
      )
        return;
      if (event === "SIGNED_OUT") {
        const manual = consumeManualSignOut();
        queryClient.clear();
        if (!manual && !window.location.pathname.startsWith("/login")) {
          navigate({
            to: "/login",
            search: { reason: "expired" },
            replace: true,
          });
          return;
        }
      }
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, navigate, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {shellOwnsToaster ? null : (
        <ThemeProvider defaultTheme="dark">
          <Toaster />
        </ThemeProvider>
      )}
    </QueryClientProvider>
  );
}
