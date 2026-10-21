import { Link, getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { canAccess, type SectionId } from "@/lib/rbac";
import { StatePanel } from "./states";
import { Button } from "@4rged-ai/platform";

const authApi = getRouteApi("/_authenticated");

export function useAccess() {
  return authApi.useRouteContext().access;
}

/** Renders page content only when the signed-in role may open this section. */
export function SectionGuard({
  section,
  children,
}: {
  section: SectionId;
  children: ReactNode;
}) {
  const access = useAccess();
  if (!canAccess(access.role, section)) {
    return (
      <div>
        <StatePanel
          tone="error"
          title="Access denied"
          description="Your role does not permit access to this page. Contact a State Administrator if you believe this is wrong."
          action={
            <Button
              size="lg"
              variant="outline"
              className="tasmac-btn tasmac-btn-toolbar"
              asChild
            >
              <Link to="/dashboard">Return to dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}

interface FeaturePageProps {
  section: SectionId;
  title: string;
  description: string;
  sectionTitle: string;
  emptyTitle: string;
  emptyDescription: string;
}

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-10 flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="tasmac-page-title text-foreground">{title}</h1>
        <p className="max-w-3xl text-sm leading-[22px] text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function FeaturePage(props: FeaturePageProps) {
  return (
    <SectionGuard section={props.section}>
      <div className="flex flex-col gap-6">
        <PageHeading title={props.title} description={props.description} />
        <section
          className="flex flex-col gap-4"
          aria-label={props.sectionTitle}
        >
          <h2 className="tasmac-section-title">{props.sectionTitle}</h2>
          <StatePanel
            title={props.emptyTitle}
            description={props.emptyDescription}
          />
        </section>
      </div>
    </SectionGuard>
  );
}
