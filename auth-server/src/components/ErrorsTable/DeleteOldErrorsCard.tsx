"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useCallback,
  useMemo,
  useState,
  useTransition,
} from "react";
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

function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function DeleteOldErrorsCard(): ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);

  const defaultValue = useMemo<string>(() => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return toLocalDatetimeInputValue(thirtyDaysAgo);
  }, []);

  const [beforeInput, setBeforeInput] = useState<string>(defaultValue);

  const beforeDate: Date | null = useMemo<Date | null>(() => {
    if (!beforeInput) return null;
    const d = new Date(beforeInput);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [beforeInput]);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setBeforeInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!beforeDate) {
        toast({
          variant: "destructive",
          title: "Invalid date",
          description: "Please pick a valid datetime before submitting.",
        });
        return;
      }
      setIsConfirmOpen(true);
    },
    [beforeDate, toast],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!beforeDate) return;
    const iso = beforeDate.toISOString();

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/errors?before=${encodeURIComponent(iso)}`,
          {
            method: "DELETE",
            credentials: "include",
          },
        );

        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) {
          throw new Error(
            body.message ?? `Request failed with status ${response.status}`,
          );
        }

        toast({
          title: "Errors deleted",
          description: body.message ?? "Old errors were deleted.",
        });
        setIsConfirmOpen(false);
        router.refresh();
      } catch (e: unknown) {
        console.error("Failed to delete old errors:", e);
        toast({
          variant: "destructive",
          title: "Failed to delete errors",
          description:
            e instanceof Error ? e.message : "An unknown error occurred",
        });
      }
    });
  }, [beforeDate, router, toast]);

  return (
    <>
      <Card
        className="w-full border-destructive/40"
        data-testid="delete-old-errors-card"
      >
        <CardHeader>
          <CardTitle>Delete old errors</CardTitle>
          <CardDescription>
            Permanently remove every captured exception whose{" "}
            <code className="font-mono">created_at</code> is strictly before the
            selected datetime. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="grid gap-2 max-w-md">
              <Label htmlFor="delete-errors-before">Delete errors before</Label>
              <Input
                id="delete-errors-before"
                data-testid="delete-old-errors-before-input"
                type="datetime-local"
                value={beforeInput}
                onChange={handleChange}
                disabled={isPending}
                required
              />
              {beforeDate ? (
                <p className="text-xs text-muted-foreground">
                  Will delete errors captured before{" "}
                  <span className="font-mono">{beforeDate.toISOString()}</span>
                  .
                </p>
              ) : null}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={isPending || !beforeDate}
              data-testid="delete-old-errors-submit"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete errors before…
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete old errors?</DialogTitle>
            <DialogDescription>
              This will permanently delete every captured exception with a
              <code className="font-mono bg-muted px-1 py-0.5 rounded mx-1">
                created_at
              </code>
              strictly before{" "}
              <span className="font-mono">
                {beforeDate ? beforeDate.toISOString() : ""}
              </span>
              . This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isPending || !beforeDate}
              data-testid="delete-old-errors-confirm"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isPending ? "Deleting…" : "Delete errors"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DeleteOldErrorsCard;
