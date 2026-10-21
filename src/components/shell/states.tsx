import type { ReactNode } from "react";
import { Card, EmptyState, Skeleton } from "@4rged-ai/platform";

interface StateProps {
  title: string;
  description: string;
  tone?: "neutral" | "error";
  action?: ReactNode;
}

/** Shared empty / error / access state, composed from 4RGE Card + EmptyState. */
export function StatePanel({
  title,
  description,
  tone = "neutral",
  action,
}: StateProps) {
  return (
    <Card
      variant="outlined"
      role={tone === "error" ? "alert" : "status"}
      data-tone={tone}
      className="tasmac-state flex min-h-56 items-center justify-center rounded-[10px] border-border bg-card p-6"
    >
      <EmptyState
        tone={tone}
        title={
          <span
            className={
              tone === "error" ? "text-destructive" : "text-foreground"
            }
          >
            {title}
          </span>
        }
        description={<span className="block max-w-md">{description}</span>}
        action={action ? <div className="flex gap-2">{action}</div> : undefined}
      />
    </Card>
  );
}

export function FullPageState(props: StateProps) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="w-full max-w-xl">
        <StatePanel {...props} />
      </div>
    </main>
  );
}

export function FullPageLoading({
  label = "Loading application",
}: {
  label?: string;
}) {
  return (
    <main
      className="grid min-h-dvh place-items-center bg-background p-6"
      aria-label={label}
      aria-busy
    >
      <Card
        variant="outlined"
        aria-hidden
        className="flex w-full max-w-[440px] flex-col gap-4 rounded-[12px] border-border bg-card p-7"
      >
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    </main>
  );
}

export function BrandMark() {
  return (
    <span aria-hidden className="tasmac-brand-mark">
      <img src="/tasmac-bottle-mark.png" alt="" />
    </span>
  );
}
