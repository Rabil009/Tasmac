import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  Clock3,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeft,
  Settings,
  Settings2,
  Sun,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AppShell as PlatformShell,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  NavExpandableItem,
  NavItem,
  NavSection,
  NavSectionItem,
  NotificationMenu,
  Sidebar,
  UserMenuButton,
  useTheme,
} from "@4rged-ai/platform";
import { signOut } from "@/lib/access";
import { BrandMark } from "@/components/shell/states";
import { useOperationalNotifications } from "@/lib/notifications";
import {
  ROLE_LABELS,
  navigationForRole,
  type AccessState,
  type SectionId,
} from "@/lib/rbac";

const icons: Record<SectionId, LucideIcon> = {
  dashboard: LayoutDashboard,
  inventory: Boxes,
  stock: ClipboardList,
  tracking: History,
  reports: ChartNoAxesCombined,
  management: Settings2,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function LiveDateTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const date = now
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(now)
    : "Loading date";
  const time = now
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now)
    : "--:--:--";

  return (
    <time
      className="tasmac-live-datetime"
      dateTime={now?.toISOString()}
      title="Indian Standard Time"
    >
      <Clock3 aria-hidden className="size-4 shrink-0" />
      <span className="tasmac-live-date">{date}</span>
      <span className="tasmac-live-time">{time} IST</span>
    </time>
  );
}

/** Applies one lightweight palette change without snapshotting the whole page. */
function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  function applyTheme(next: "light" | "dark") {
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    root.classList.toggle("light", next === "light");
    root.dataset.theme = next;
    root.style.colorScheme = next;
    setTheme(next);
  }

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    applyTheme(next);
  }

  return (
    <button
      type="button"
      className={`icon-button-quiet ${className ?? ""}`}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Moon aria-hidden className="h-4 w-4" /> : <Sun aria-hidden className="h-4 w-4" />}
    </button>
  );
}

/** Route 4RGE nav anchors through the client router instead of full reloads. */
function useClientNavigation() {
  const router = useRouter();
  return (event: MouseEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    )
      return;
    const anchor = (event.target as HTMLElement).closest("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!href.startsWith("/")) return;
    event.preventDefault();
    void router.navigate({ to: href });
  };
}

/**
 * 4RGE nav anchors carry native `title` labels, which pop up over the expanded menu.
 * Strip them, and show a compact delayed label to the right only in the collapsed rail.
 */
function useCollapsedNavTooltip() {
  const [tip, setTip] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    const strip = (root: ParentNode) =>
      root
        .querySelectorAll<HTMLElement>(".group\\/sidebar [title]")
        .forEach((el) => {
          el.dataset["navLabel"] = el.getAttribute("title") ?? "";
          el.removeAttribute("title");
        });
    strip(document);
    const mo = new MutationObserver(() => strip(document));
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributeFilter: ["title"],
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const target = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(
        "a[data-nav-label]",
      );
      const rail = el?.closest('.group\\/sidebar[aria-expanded="false"]');
      return el && rail ? el : null;
    };
    const show = (e: Event) => {
      const el = target(e);
      clearTimeout(timer);
      if (!el) return setTip(null);
      timer = setTimeout(() => {
        const r = el.getBoundingClientRect();
        setTip({
          label: el.dataset["navLabel"] ?? "",
          x: r.right + 12,
          y: r.top + r.height / 2,
        });
      }, 300);
    };
    const hide = () => {
      clearTimeout(timer);
      setTip(null);
    };
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("pointerout", hide);
    document.addEventListener("focusout", hide);
    document.addEventListener("click", hide);
    return () => {
      mo.disconnect();
      clearTimeout(timer);
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("pointerout", hide);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("click", hide);
    };
  }, []);
  return tip
    ? createPortal(
        <div
          role="tooltip"
          className="tasmac-nav-tooltip"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.label}
        </div>,
        document.body,
      )
    : null;
}

export function AppShell({
  access,
  children,
}: {
  access: AccessState;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificationFeed = useOperationalNotifications(access.userId);
  const onNavigate = useClientNavigation();
  const items = navigationForRole(access.role);
  const navTooltip = useCollapsedNavTooltip();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const displayName = access.fullName?.trim() || access.email;
  const notificationItems = notificationFeed.items.map((notification) => ({
    id: notification.id,
    title: notification.title,
    description: notification.body,
    timestamp: new Date(notification.created_at),
    unread: notification.read_at === null,
  }));

  function handleNotification(id: string) {
    const notification = notificationFeed.items.find((item) => item.id === id);
    if (!notification) return;
    void notificationFeed.markRead(notification.id);
    if (notification.href !== pathname)
      void navigate({ to: notification.href as never });
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/login", replace: true });
  }

  const sidebar = (
    <Sidebar
      onNavigate={onNavigate}
      footer={
        <p className="truncate px-2 text-xs text-tertiary group-aria-[expanded=false]/sidebar:hidden">
          Inventory operations
        </p>
      }
    >
      <NavSection ariaLabel="Application navigation">
        {items.map((item) => {
          const Icon = icons[item.id];
          const icon = <Icon aria-hidden className="h-5 w-5" />;
          if (item.children) {
            const prefix = item.href.split("/").slice(0, 2).join("/");
            return (
              <NavSectionItem key={item.id}>
                <NavExpandableItem
                  icon={icon}
                  label={item.label}
                  href={item.href}
                  active={isActive(pathname, prefix)}
                  defaultExpanded
                  items={item.children.map((child) => ({
                    id: child.id,
                    label: child.label,
                    href: child.href,
                    active: pathname === child.href,
                  }))}
                />
              </NavSectionItem>
            );
          }
          return (
            <NavSectionItem key={item.id}>
              <NavItem
                icon={icon}
                label={item.label}
                href={item.href}
                active={isActive(pathname, item.href)}
              />
            </NavSectionItem>
          );
        })}
      </NavSection>
    </Sidebar>
  );

  const header = (
    <header className="tasmac-topbar">
      <div className="tasmac-topbar-inner">
        <button
          type="button"
          className="tasmac-mobile-sidebar-toggle"
          aria-label="Open navigation"
          onClick={() => window.dispatchEvent(new Event("fp-toggle-sidebar"))}
        >
          <PanelLeft aria-hidden className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="tasmac-topbar-brand"
          aria-label="Toggle navigation"
          aria-keyshortcuts="Meta+B Control+B"
          onClick={() => window.dispatchEvent(new Event("fp-toggle-sidebar"))}
        >
          <span className="tasmac-topbar-brand-logo" aria-hidden>
            <BrandMark />
            <PanelLeft
              aria-hidden
              className="tasmac-topbar-brand-toggle-icon"
            />
          </span>
          <span>TASMAC Inventory</span>
        </button>
        <div className="tasmac-topbar-tools">
          <LiveDateTime />
          <span className="tasmac-topbar-divider tasmac-live-time-divider" aria-hidden />
          <ThemeToggle className="tasmac-theme-switcher" />
          <span className="tasmac-topbar-divider" aria-hidden />
          <NotificationMenu
            notifications={notificationItems}
            unread={notificationFeed.unread}
            onNotificationClick={(notification) =>
              handleNotification(notification.id)
            }
            onMarkAllRead={() => void notificationFeed.markAllRead()}
            showViewAll={false}
            emptyMessage="No new notifications."
          />
          <span className="tasmac-topbar-divider" aria-hidden />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <UserMenuButton
                fallback={initialsFor(displayName)}
                aria-label="Open profile menu"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              variant="profile"
              className="tasmac-profile-menu w-[17rem]"
            >
              <div className="tasmac-profile-summary">
                <p className="truncate text-[15px] font-semibold leading-5 text-foreground">
                  {displayName}
                </p>
                <p className="mt-1 truncate text-xs leading-4 text-muted-foreground">
                  {access.email}
                </p>
                <p className="tasmac-profile-role">
                  {access.role ? ROLE_LABELS[access.role] : "No role"}
                </p>
              </div>
              <DropdownMenuSeparator />
              {access.role === "state_admin" ? (
                <DropdownMenuItem
                  className="tasmac-profile-action"
                  onSelect={() => void navigate({ to: "/management/settings" })}
                >
                  <Settings2 aria-hidden className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="tasmac-profile-action"
                onSelect={() => setPreferencesOpen(true)}
              >
                <Settings aria-hidden className="h-4 w-4" />
                Appearance
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="tasmac-profile-action tasmac-profile-signout"
                onSelect={handleSignOut}
              >
                <LogOut aria-hidden className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );

  return (
    <PlatformShell
      sidebar={sidebar}
      header={header}
      chat={false}
      sidebarDefaultExpanded
      // `relative` makes the inner wrapper the containing block, so absolutely positioned
      // descendants (e.g. sr-only labels) stay inside the single content scroller.
      contentInnerClassName="tasmac-content-inner relative px-4 py-6 sm:px-6 lg:px-8"
    >
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        {children}
      </main>
      {navTooltip}
      <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Display settings</DialogTitle>
            <DialogDescription>
              Choose the appearance that is most comfortable for your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Light or dark mode
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your choice is saved for this device.
              </p>
            </div>
            <ThemeToggle className="tasmac-theme-switcher" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreferencesOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformShell>
  );
}
