"use client";

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
import { type ReactElement, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import type { SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";
import { getUseAppDomainsListEndpoint } from "@/components/AppsTable";

export interface RemoveAppDomainDialogProps {
  /** The domain to detach from its app. */
  domain: SchemaVaultsAppDomainRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after the domain has been removed, once the SWR cache for the
   * app's domains list has been invalidated. Surfaces that render domains
   * from server-side props (rather than `useAppDomains`) use this to
   * refresh themselves.
   */
  onRemoved?: (domain: SchemaVaultsAppDomainRef) => void;
}

/**
 * Confirms detaching a domain from a client application. Domains can be
 * added again, so a plain confirmation suffices (no type-to-confirm).
 */
export function RemoveAppDomainDialog({
  domain,
  open,
  onOpenChange,
  onRemoved,
}: RemoveAppDomainDialogProps): ReactElement {
  const [removing, startRemoving] = useTransition();
  const { toast } = useToast();
  const auth = useAuth();
  const { mutate } = useSWRConfig();

  function handleRemove(): void {
    startRemoving(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        await authClient.deleteClientApplicationDomain(
          domain.app_id,
          domain.app_domain_ref_id,
        );
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to remove domain",
          description:
            e instanceof Error ? e.message : "Failed to send network request",
        });
        return;
      }

      toast({ variant: "default", title: "Domain removed" });
      mutate(
        (key) => key === getUseAppDomainsListEndpoint(domain.app_id),
        undefined,
        { revalidate: true },
      );
      onOpenChange(false);
      onRemoved?.(domain);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        id="remove-app-domain-dialog-content"
      >
        <DialogHeader>
          <DialogTitle>Remove domain?</DialogTitle>
          <DialogDescription>
            <span className="font-medium break-all">{domain.domain}</span> (
            {domain.environment}) will be detached from this application. Its
            origin will no longer be allowed to call the auth server, and in
            environments without explicit callback URLs sign-in redirects to
            it will be refused. You can add it again later.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={removing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            id="confirm-remove-app-domain-button"
            onClick={handleRemove}
            disabled={removing}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RemoveAppDomainDialog;
