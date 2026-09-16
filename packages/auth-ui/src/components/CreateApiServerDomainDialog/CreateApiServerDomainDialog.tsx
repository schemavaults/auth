"use client";

import { type ReactElement } from "react";

import { Dialog, DialogContent } from "@schemavaults/ui";
import type {
  ApiServerId,
  SchemaVaultsApiServerDomainRef,
} from "@schemavaults/app-definitions";
import CreateApiServerDomainForm from "./CreateApiServerDomainForm";

export interface CreateApiServerDomainDialogProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  uuid: () => string;
  /**
   * The API server the new domain is attached to. When omitted, the target
   * is read from `CreateApiServerDomainDialogOpenContext` (the pattern used
   * by the API servers table, where a row action sets the id that opens the
   * dialog). Pass it explicitly on surfaces that already know their API
   * server, such as an API server's detail page.
   */
  api_server_id?: ApiServerId;
  /**
   * Called after a domain has been created successfully, once the SWR cache
   * for the API server's domains list has been invalidated. Surfaces that
   * render domains from server-side props (rather than
   * `useApiServerDomains`) use this to refresh themselves.
   */
  onCreated?: (domain: SchemaVaultsApiServerDomainRef) => void;
}

/**
 * Thin wrapper following the same pattern as CreateApiServerDialog: the form
 * lives in a child component inside DialogContent, so each dialog open mounts
 * a fresh form initialized with complete default values (no post-open
 * setValue re-render, and a new domain ref id per open).
 */
export function CreateApiServerDomainDialog({
  open,
  onOpenChange,
  uuid,
  api_server_id,
  onCreated,
}: CreateApiServerDomainDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        id="create-api-server-domain-dialog-content"
      >
        <CreateApiServerDomainForm
          uuid={uuid}
          api_server_id={api_server_id}
          onSuccess={(domain: SchemaVaultsApiServerDomainRef): void => {
            onOpenChange(false);
            onCreated?.(domain);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export default CreateApiServerDomainDialog;
