import type { ReactNode } from "react";
import {
  Button,
  Dialog as AlertDialog,
  DialogClose,
  DialogContent as AlertDialogContent,
  DialogDescription as AlertDialogDescription,
  DialogFooter as AlertDialogFooter,
  DialogHeader as AlertDialogHeader,
  DialogTitle as AlertDialogTitle,
} from "@4rged-ai/platform";
import { Label } from "@4rged-ai/platform";

export const selectClass =
  "tasmac-select h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function Field(props: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={props.id}>
        {props.label}
        {props.optional ? (
          <span className="ml-1.5 font-normal text-muted-foreground">
            Optional
          </span>
        ) : null}
      </Label>
      {props.children}
      {props.error ? (
        <p id={`${props.id}-error`} className="text-xs text-destructive">
          {props.error}
        </p>
      ) : props.hint ? (
        <p className="text-xs text-muted-foreground">{props.hint}</p>
      ) : null}
    </div>
  );
}

/** aria props wiring an input to its Field error. */
export function errProps(id: string, error?: string) {
  return {
    id,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : undefined,
  };
}

export function ConfirmDelete(props: {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={(o) => !o && props.onCancel()}>
      <AlertDialogContent hideClose>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <DialogClose asChild>
            <Button
              size="lg"
              variant="outline"
              className="tasmac-btn tasmac-btn-dialog"
              disabled={props.pending}
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="lg"
            disabled={props.pending}
            variant="destructive"
            className="tasmac-btn tasmac-btn-dialog min-w-[6.5rem]"
            onClick={(e) => {
              e.preventDefault();
              props.onConfirm();
            }}
          >
            {props.pending ? "Deleting…" : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function StatusText({ active }: { active: boolean }) {
  return (
    <span className={active ? "text-success" : "text-muted-foreground"}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}
