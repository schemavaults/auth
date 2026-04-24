"use client";

import {
  type ReactElement,
  useCallback,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useToast,
} from "@schemavaults/ui";
import { Trash2 } from "lucide-react";

export interface DeleteErrorButtonProps {
  error_id: string;
}

export function DeleteErrorButton({
  error_id,
}: DeleteErrorButtonProps): ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);

  const handleConfirmDelete = useCallback(() => {
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/errors/${encodeURIComponent(error_id)}`,
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
          title: "Error deleted",
          description: body.message ?? "The error was deleted.",
        });
        setIsConfirmOpen(false);
        router.push("/admin/errors");
        router.refresh();
      } catch (e: unknown) {
        console.error("Failed to delete error:", e);
        toast({
          variant: "destructive",
          title: "Failed to delete error",
          description:
            e instanceof Error ? e.message : "An unknown error occurred",
        });
      }
    });
  }, [error_id, router, toast]);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setIsConfirmOpen(true)}
        disabled={isPending}
        data-testid="delete-error-button"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete this error
      </Button>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete this error?</DialogTitle>
            <DialogDescription>
              This will permanently delete error{" "}
              <code className="font-mono bg-muted px-1 py-0.5 rounded">
                {error_id}
              </code>
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
              disabled={isPending}
              data-testid="delete-error-confirm"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isPending ? "Deleting…" : "Delete error"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DeleteErrorButton;
