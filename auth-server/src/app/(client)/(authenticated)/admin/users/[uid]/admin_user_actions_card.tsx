"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
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
import { Ban, CheckCircle2, Mail, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useCallback, useState, useTransition } from "react";
import type { UserData } from "@schemavaults/auth-common";

export interface AdminUserActionsCardProps {
  user: UserData;
  sessionUid: string;
}

export function AdminUserActionsCard({
  user,
  sessionUid,
}: AdminUserActionsCardProps): ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [resending, startResending] = useTransition();
  const [togglingDisabled, startTogglingDisabled] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmInput, setConfirmInput] = useState<string>("");
  const [deleting, startDeleting] = useTransition();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState<string>("");

  const isSelf: boolean = user.uid === sessionUid;
  const isDisabled: boolean = user.disabled === true;
  const isVerified: boolean = user.email_verified === true;
  const isConfirmed: boolean = confirmInput === user.email;
  const isDeleteConfirmed: boolean = deleteConfirmInput === user.email;

  const handleResendVerification = useCallback((): void => {
    startResending(async () => {
      try {
        const response = await fetch(
          `/api/admin/users/${user.uid}/resend-verification`,
          {
            method: "POST",
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
          title: "Verification email sent",
          description: `A new verification link has been sent to ${user.email}.`,
        });
      } catch (e: unknown) {
        console.error("Failed to resend verification email:", e);
        toast({
          variant: "destructive",
          title: "Failed to resend verification email",
          description:
            e instanceof Error ? e.message : "An unknown error occurred",
        });
      }
    });
  }, [toast, user.email, user.uid]);

  const handleConfirmOpenChange = useCallback(
    (open: boolean): void => {
      if (!open) {
        setConfirmInput("");
      }
      setConfirmOpen(open);
    },
    [],
  );

  const handleToggleDisabled = useCallback((): void => {
    startTogglingDisabled(async () => {
      try {
        const method: "POST" | "DELETE" = isDisabled ? "DELETE" : "POST";
        const response = await fetch(
          `/api/admin/users/${user.uid}/disable`,
          {
            method,
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
          title: isDisabled ? "Account enabled" : "Account disabled",
          description: isDisabled
            ? `${user.email} can now log in again.`
            : `${user.email} has been blocked from logging in.`,
        });
        setConfirmInput("");
        setConfirmOpen(false);
        router.refresh();
      } catch (e: unknown) {
        console.error("Failed to toggle disabled state:", e);
        toast({
          variant: "destructive",
          title: isDisabled
            ? "Failed to enable account"
            : "Failed to disable account",
          description:
            e instanceof Error ? e.message : "An unknown error occurred",
        });
      }
    });
  }, [isDisabled, router, toast, user.email, user.uid]);

  const handleDeleteConfirmOpenChange = useCallback(
    (open: boolean): void => {
      if (!open) {
        setDeleteConfirmInput("");
      }
      setDeleteConfirmOpen(open);
    },
    [],
  );

  const handleDeleteUser = useCallback((): void => {
    startDeleting(async () => {
      try {
        const response = await fetch(`/api/admin/users/${user.uid}`, {
          method: "DELETE",
          credentials: "include",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) {
          throw new Error(
            body.message ?? `Request failed with status ${response.status}`,
          );
        }
        toast({
          title: "Account deleted",
          description: `${user.email} and all of their owned resources have been permanently deleted.`,
        });
        setDeleteConfirmInput("");
        setDeleteConfirmOpen(false);
        router.push("/admin/users");
        router.refresh();
      } catch (e: unknown) {
        console.error("Failed to delete user:", e);
        toast({
          variant: "destructive",
          title: "Failed to delete account",
          description:
            e instanceof Error ? e.message : "An unknown error occurred",
        });
      }
    });
  }, [router, toast, user.email, user.uid]);

  return (
    <Card className="w-full" data-testid="admin-user-actions-card">
      <CardHeader>
        <CardTitle>Actions</CardTitle>
        <CardDescription>
          Administrative operations that affect this user&apos;s account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              Resend email verification link
            </span>
            <span className="text-sm text-muted-foreground">
              {isVerified
                ? "This user's email is already verified."
                : "Send a fresh verification link to this user's email address."}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={isVerified || resending}
            onClick={handleResendVerification}
            data-testid="admin-user-resend-verification-button"
          >
            <Mail className="h-4 w-4 mr-2" />
            {resending ? "Sending..." : "Resend verification email"}
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              {isDisabled ? "Enable account" : "Disable account"}
            </span>
            <span className="text-sm text-muted-foreground">
              {isDisabled
                ? "Allow this user to log in and request new tokens again."
                : "Block this user from logging in or acquiring new tokens. Existing access tokens remain valid until they expire."}
            </span>
          </div>
          {isDisabled ? (
            <Button
              type="button"
              variant="outline"
              disabled={isSelf || togglingDisabled}
              onClick={handleToggleDisabled}
              data-testid="admin-user-enable-account-button"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {togglingDisabled ? "Enabling..." : "Enable account"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={isSelf || togglingDisabled}
              onClick={() => setConfirmOpen(true)}
              data-testid="admin-user-disable-account-button"
            >
              <Ban className="h-4 w-4 mr-2" />
              Disable account
            </Button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border/50 pt-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Delete account</span>
            <span className="text-sm text-muted-foreground">
              Permanently delete this user, their organization memberships,
              tokens, MFA factors, and any organizations (with their apps and
              APIs) where they are the only member. This cannot be undone.
            </span>
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={isSelf || deleting}
            onClick={() => setDeleteConfirmOpen(true)}
            data-testid="admin-user-delete-account-button"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete account
          </Button>
        </div>
        {isSelf ? (
          <span className="text-xs text-muted-foreground">
            You cannot change your own disabled state or delete your own
            account.
          </span>
        ) : null}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Disable account</DialogTitle>
            <DialogDescription>
              This will block {user.email} from logging in or acquiring new
              tokens. You can re-enable the account later.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-disable-email">
                Type <span className="font-bold">{user.email}</span> to confirm
              </Label>
              <Input
                id="confirm-disable-email"
                data-testid="admin-user-disable-account-confirm-input"
                placeholder={user.email}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                disabled={togglingDisabled}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleConfirmOpenChange(false)}
              disabled={togglingDisabled}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleToggleDisabled}
              disabled={!isConfirmed || togglingDisabled}
              data-testid="admin-user-disable-account-confirm-button"
            >
              <Ban className="h-4 w-4 mr-2" />
              {togglingDisabled ? "Disabling..." : "Disable account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={handleDeleteConfirmOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              This will permanently delete {user.email}, including their
              passwords, sessions, MFA factors, organization memberships, and
              any organizations where they are the only member (along with
              those organizations&apos; apps and APIs). This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-delete-email">
                Type <span className="font-bold">{user.email}</span> to confirm
              </Label>
              <Input
                id="confirm-delete-email"
                data-testid="admin-user-delete-account-confirm-input"
                placeholder={user.email}
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                disabled={deleting}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDeleteConfirmOpenChange(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={!isDeleteConfirmed || deleting}
              data-testid="admin-user-delete-account-confirm-button"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleting ? "Deleting..." : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default AdminUserActionsCard;
