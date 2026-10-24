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
import type { SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";
import { getUseApiServerDomainsListEndpoint } from "@/components/ApiServersTable";

export interface RemoveApiServerDomainDialogProps {
  /** The domain to detach from its API server. */
  domain: SchemaVaultsApiServerDomainRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after the domain has been removed, once the SWR cache for the
   * API server's domains list has been invalidated. Surfaces that render
   * domains from server-side props (rather than `useApiServerDomains`) use
   * this to refresh themselves.
   */
  onRemoved?: (domain: SchemaVaultsApiServerDomainRef) => void;
}

/**
 * Confirms detaching a domain from an API server. Domains can be added
 * again, so a plain confirmation suffices (no type-to-confirm).
 */
export function RemoveApiServerDomainDialog({
  domain,
  open,
  onOpenChange,
  onRemoved,
}: RemoveApiServerDomainDialogProps): ReactElement {
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
        await authClient.deleteApiServerDomain(
          domain.api_server_id,
          domain.api_server_domain_ref_id,
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
        (key) =>
          key === getUseApiServerDomainsListEndpoint(domain.api_server_id),
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
        id="remove-api-server-domain-dialog-content"
      >
        <DialogHeader>
          <DialogTitle>Remove domain?</DialogTitle>
          <DialogDescription>
            <span className="font-medium break-all">{domain.domain}</span> (
            {domain.environment}) will be detached from this API server.
            Authorization requests whose resource URL is on this domain will
            no longer resolve to it. You can add it again later.
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
            id="confirm-remove-api-server-domain-button"
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

export default RemoveApiServerDomainDialog;
