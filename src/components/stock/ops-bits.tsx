import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Check,
  MousePointerClick,
  MinusCircle,
  PlusCircle,
  RotateCcw,
} from "lucide-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@4rged-ai/platform";
import { errProps } from "@/components/shell/form-bits";
import { ALL } from "@/lib/ops-format";
import { MOVEMENT_LABELS, type MovementType } from "@/lib/stock";

export interface Opt {
  value: string;
  label: string;
}

/** Form dropdown on the 4RGE Select. Empty value shows the placeholder. */
export function OpSelect(props: {
  id: string;
  value: string;
  placeholder: string;
  options: Opt[];
  error?: string | undefined;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={props.value}
      onValueChange={props.onChange}
      disabled={props.disabled ?? false}
    >
      <SelectTrigger
        {...errProps(props.id, props.error)}
        className="tasmac-select-trigger"
        title={props.options.find((o) => o.value === props.value)?.label}
      >
        <SelectValue placeholder={props.placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="tasmac-select-content tasmac-ws-menu"
      >
        {props.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Filter dropdown: "" ↔ ALL sentinel, first option is the "all" label. */
export function FilterSelect(props: {
  id: string;
  value: string;
  allLabel: string;
  options: Opt[];
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={props.value || ALL}
      disabled={props.disabled ?? false}
      onValueChange={(v) => props.onChange(v === ALL ? "" : v)}
    >
      <SelectTrigger
        id={props.id}
        className="tasmac-select-trigger"
        title={
          props.options.find((o) => o.value === props.value)?.label ??
          props.allLabel
        }
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="tasmac-select-content tasmac-ws-menu"
      >
        <SelectItem value={ALL}>{props.allLabel}</SelectItem>
        {props.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OpSurface(props: {
  title: string;
  label?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={"tasmac-op-surface " + (props.className ?? "")}
      aria-label={props.label ?? props.title}
    >
      <header className="tasmac-op-surface-head">
        <h2 className="tasmac-section-title">{props.title}</h2>
        {props.aside}
      </header>
      {props.children}
    </section>
  );
}

export function Row({
  k,
  children,
  mono,
}: {
  k: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="tasmac-dl-row">
      <dt className="text-muted-foreground">{k}</dt>
      <dd
        className={
          "text-right font-medium text-foreground " +
          (mono ? "font-mono text-xs" : "")
        }
      >
        {children}
      </dd>
    </div>
  );
}

const TYPE_ICON: Record<MovementType, typeof PlusCircle> = {
  receive: ArrowDownToLine,
  issue: ArrowUpFromLine,
  adjust_surplus: PlusCircle,
  adjust_writeoff: MinusCircle,
  transfer_out: ArrowLeftRight,
  transfer_in: ArrowLeftRight,
};

export function MovementTypeCell({ type }: { type: string | null }) {
  if (!type) return <>—</>;
  const t = type as MovementType;
  const Icon = TYPE_ICON[t] ?? ArrowLeftRight;
  return (
    <span className="tasmac-move-type">
      <Icon aria-hidden />
      {MOVEMENT_LABELS[t] ?? type}
    </span>
  );
}

export function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      className="tasmac-btn tasmac-btn-retry"
      onClick={onClick}
    >
      <RotateCcw aria-hidden />
      Retry
    </Button>
  );
}

export interface FlowStage {
  label: string;
  done: boolean;
}

/**
 * Quiet progress readout for a stock form. Purely derived from form state: it is
 * not navigation and never blocks completing the form in any order.
 */
export function OperationFlow({ stages }: { stages: readonly FlowStage[] }) {
  const current = stages.findIndex((s) => !s.done);
  return (
    <ol className="tasmac-flow" aria-label="Operation progress">
      {stages.map((s, i) => {
        const state = s.done ? "done" : i === current ? "current" : "todo";
        return (
          <li key={s.label} className="tasmac-flow-step" data-state={state}>
            <span className="tasmac-flow-num" aria-hidden>
              {s.done ? <Check /> : i + 1}
            </span>
            <span className="tasmac-flow-label">{s.label}</span>
            <span className="sr-only">
              {state === "done"
                ? " (complete)"
                : state === "current"
                  ? " (in progress)"
                  : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Compact pre-selection hint for the context panel. */
export function ContextHint({ children }: { children: ReactNode }) {
  return (
    <p className="tasmac-context-hint">
      <MousePointerClick aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Review sentence shown beside the form actions. */
export function ReviewLine({ text }: { text: string | null }) {
  return (
    <p className="tasmac-review-line" aria-live="polite">
      {text ?? "Complete the required fields to review this entry."}
    </p>
  );
}
