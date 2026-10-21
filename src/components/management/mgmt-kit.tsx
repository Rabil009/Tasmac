import type { ReactNode } from "react";
import { Pencil, Plus, Search as SearchIcon, Trash2, X } from "lucide-react";
import { Button, Input, Label, Skeleton } from "@4rged-ai/platform";
import { StatePanel } from "@/components/shell/states";
import {
  FilterSelect,
  RetryButton,
  type Opt,
} from "@/components/stock/ops-bits";

/** 22px status lozenge. Tone carries meaning: active (teal), neutral, pending (amber), inactive (grey). */
export function StatusLozenge({
  label,
  tone,
}: {
  label: string;
  tone: "active" | "neutral" | "pending" | "inactive";
}) {
  return (
    <span className="tasmac-health" data-mgmt={tone}>
      <span className="tasmac-health-dot" aria-hidden />
      {label}
    </span>
  );
}

export function AddButton({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string | undefined;
}) {
  return (
    <Button
      size="lg"
      className="tasmac-btn tasmac-btn-primary"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <Plus aria-hidden />
      {label}
    </Button>
  );
}

export function EditAction({
  label,
  onClick,
  disabled,
  title,
  text = "Edit",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string | undefined;
  text?: string;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="tasmac-btn tasmac-btn-row"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Pencil aria-hidden />
      {text}
    </Button>
  );
}

export function DeleteAction({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string | undefined;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="tasmac-btn tasmac-btn-row tasmac-btn-row-danger"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 aria-hidden />
      Delete
    </Button>
  );
}

export function TableLoading() {
  return <Skeleton className="h-64 w-full" aria-label="Loading records" />;
}

export function LoadError({
  title,
  onRetry,
}: {
  title: string;
  onRetry: () => void;
}) {
  return <RetryPanel title={title} onRetry={onRetry} />;
}

function RetryPanel({
  title,
  onRetry,
}: {
  title: string;
  onRetry: () => void;
}) {
  return (
    <StatePanel
      tone="error"
      title={title}
      description="The service did not respond. Try again."
      action={<RetryButton onClick={onRetry} />}
    />
  );
}

export interface FilterDef {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: Opt[];
  onChange: (v: string) => void;
}

/** Client-side filter toolbar over already loaded records. */
export function MgmtToolbar({
  q,
  onQ,
  onSearch,
  placeholder,
  filters,
  dirty,
  onClear,
}: {
  q: string;
  onQ: (v: string) => void;
  onSearch: () => void;
  placeholder: string;
  filters: FilterDef[];
  dirty: boolean;
  onClear: () => void;
}) {
  return (
    <form
      className="tasmac-toolbar"
      role="search"
      aria-label="Filter records"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
    >
      <div className="flex min-w-56 flex-1 flex-col gap-1.5">
        <Label htmlFor="m-q">Search</Label>
        <Input
          id="m-q"
          value={q}
          maxLength={80}
          placeholder={placeholder}
          onChange={(e) => onQ(e.target.value)}
        />
      </div>
      {filters.map((f) => (
        <div key={f.id} className="flex w-full flex-col gap-1.5 sm:w-40">
          <Label htmlFor={f.id}>{f.label}</Label>
          <FilterSelect
            id={f.id}
            value={f.value}
            allLabel={f.allLabel}
            options={f.options}
            onChange={f.onChange}
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          size="lg"
          type="submit"
          variant="outline"
          className="tasmac-btn tasmac-btn-toolbar"
        >
          <SearchIcon aria-hidden />
          Search
        </Button>
        {dirty ? (
          <Button
            size="sm"
            type="button"
            variant="ghost"
            className="tasmac-btn tasmac-btn-quiet"
            onClick={onClear}
          >
            <X aria-hidden />
            Clear filters
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function NoMatches({ what }: { what: string }) {
  return (
    <StatePanel
      title={`No matching ${what}`}
      description="No records match these filters."
    />
  );
}

export function RowActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-1.5">{children}</div>
  );
}

/** Quiet band naming the record being created or edited (existing identifier only). */
export function RecordContext({
  entity,
  id,
}: {
  entity: string;
  id?: string | null | undefined;
}) {
  return (
    <p className="tasmac-record-context">
      <span className="tasmac-record-context-entity">{entity}</span>
      <span className="font-mono">{id ? id : "New record"}</span>
    </p>
  );
}
