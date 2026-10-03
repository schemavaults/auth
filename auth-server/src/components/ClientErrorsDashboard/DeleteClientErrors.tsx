"use client";

import { type FormEvent, type ReactElement, useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useToast,
} from "@schemavaults/ui";
import { Trash2 } from "lucide-react";

const DAY_MS: number = 24 * 60 * 60 * 1000;

/** Sends a DELETE and throws with the server's message on failure; returns the success message. */
async function sendDelete(url: string): Promise<string | undefined> {
  const response = await fetch(url, { method: "DELETE", credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }
  return body.message;
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactElement | string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  confirmTestId: string;
}

function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  confirmTestId,
}: ConfirmDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={(): void => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending} data-testid={confirmTestId}>
            <Trash2 className="mr-2 h-4 w-4" />
            {pending ? "Deleting…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Deletes one client error report, then returns to the dashboard. */
export function DeleteClientErrorButton({ client_error_id }: { client_error_id: string }): ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<boolean>(false);

  const onConfirm = useCallback((): void => {
    startTransition(async () => {
      try {
        const message = await sendDelete(`/api/admin/client-errors/${encodeURIComponent(client_error_id)}`);
        toast({ title: "Client error deleted", description: message ?? "The report was deleted." });
        setOpen(false);
        router.push("/admin/client-errors");
        router.refresh();
      } catch (e: unknown) {
        console.error("Failed to delete client error:", e);
        toast({
          variant: "destructive",
          title: "Failed to delete client error",
          description: e instanceof Error ? e.message : "An unknown error occurred",
        });
      }
    });
  }, [client_error_id, router, toast]);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={(): void => setOpen(true)}
        disabled={pending}
        data-testid="delete-client-error-button"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete this report
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this report?"
        description="The client error report will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete report"
        pending={pending}
        onConfirm={onConfirm}
        confirmTestId="delete-client-error-confirm"
      />
    </>
  );
}

/** Deletes every client error received more than N days ago. */
export function DeleteOldClientErrorsCard(): ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<boolean>(false);
  const [days, setDays] = useState<string>("30");

  const parsedDays: number = Number.parseInt(days, 10);
  const validDays: boolean = Number.isInteger(parsedDays) && parsedDays >= 0;

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>): void => {
      e.preventDefault();
      if (validDays) setOpen(true);
    },
    [validDays],
  );

  const onConfirm = useCallback((): void => {
    if (!validDays) return;
    const before: string = new Date(Date.now() - parsedDays * DAY_MS).toISOString();
    startTransition(async () => {
      try {
        const message = await sendDelete(`/api/admin/client-errors?before=${encodeURIComponent(before)}`);
        toast({ title: "Client errors deleted", description: message ?? "Old client errors were deleted." });
        setOpen(false);
        router.refresh();
      } catch (e: unknown) {
        console.error("Failed to delete old client errors:", e);
        toast({
          variant: "destructive",
          title: "Failed to delete client errors",
          description: e instanceof Error ? e.message : "An unknown error occurred",
        });
      }
    });
  }, [parsedDays, router, toast, validDays]);

  return (
    <>
      <Card className="w-full border-destructive/40" data-testid="delete-old-client-errors-card">
        <CardHeader>
          <CardTitle>Delete old client errors</CardTitle>
          <CardDescription>
            Permanently remove every client error report received more than the given number of days ago. This
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent>
            <div className="grid max-w-xs gap-2">
              <Label htmlFor="delete-client-errors-days">Older than (days)</Label>
              <Input
                id="delete-client-errors-days"
                type="number"
                min={0}
                step={1}
                value={days}
                onChange={(e): void => setDays(e.target.value)}
                disabled={pending}
                required
                data-testid="delete-old-client-errors-days"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || !validDays}
              data-testid="delete-old-client-errors-submit"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete old reports…
            </Button>
          </CardFooter>
        </form>
      </Card>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete old client errors?"
        description={`Every client error report received more than ${validDays ? parsedDays : "?"} day${parsedDays === 1 ? "" : "s"} ago will be permanently deleted.`}
        confirmLabel="Delete reports"
        pending={pending}
        onConfirm={onConfirm}
        confirmTestId="delete-old-client-errors-confirm"
      />
    </>
  );
}
