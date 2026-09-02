"use client";

import { createContext, useCallback, useContext, type ReactElement } from "react";
import { Datatable, useToast } from "@schemavaults/ui";
import { Loader2 } from "lucide-react";
import {
  MAXIMUM_USER_ORGANIZATIONS,
  type OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common";
import { useMyOrganizations } from "@schemavaults/auth-react-provider";
import {
  CreateOrganizationDialogDispatchContext,
  CreateOrganizationDialogTrigger,
} from "@/components/CreateOrganizationDialog";
import { columns } from "./columns";

export interface MyOrganizationsDatatableProps {
  /**
   * SSR-preloaded memberships used as SWR `fallbackData` for
   * `useMyOrganizations()` so the table renders populated on first paint.
   */
  preloaded?: readonly OrganizationMembershipRoleDetails[] | undefined;
  /**
   * Whether to show the "Create organization" header button. The button is
   * also hidden once the user has reached `MAXIMUM_USER_ORGANIZATIONS`.
   * Defaults to true.
   */
  canCreateOrganization?: boolean;
}

/**
 * Whether the table's header should show the create-organization trigger.
 * Provided by `MyOrganizationsTable` and consumed by the header component,
 * which the datatable renders without props.
 */
const ShowCreateOrganizationTriggerContext = createContext<boolean>(false);

function MyOrganizationsTableHeaderButtons(): ReactElement | null {
  const showTrigger: boolean = useContext(ShowCreateOrganizationTriggerContext);
  const onOpenChange: (val: boolean) => void = useContext(
    CreateOrganizationDialogDispatchContext,
  );
  if (!showTrigger) {
    return null;
  }
  return <CreateOrganizationDialogTrigger onOpenChange={onOpenChange} />;
}

export function MyOrganizationsTable({
  preloaded,
  canCreateOrganization = true,
}: MyOrganizationsDatatableProps): ReactElement {
  const { toast } = useToast();

  const onError = useCallback(
    (error: unknown): void => {
      toast({
        variant: "destructive",
        title: "Error loading your organizations",
        description: `${error instanceof Error ? error.message : "An unknown error occurred."}`,
      });
    },
    [toast],
  );

  const { isLoading, data } = useMyOrganizations({
    initialData: preloaded,
    onError,
  });

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  const memberships: OrganizationMembershipRoleDetails[] = data
    ? [...data]
    : [];
  const showCreateTrigger: boolean =
    canCreateOrganization && memberships.length < MAXIMUM_USER_ORGANIZATIONS;

  return (
    <ShowCreateOrganizationTriggerContext.Provider value={showCreateTrigger}>
      <Datatable<OrganizationMembershipRoleDetails>
        data={memberships}
        columns={columns}
        initialVisibleColumns={{
          actions: true,
          organization_name: true,
          organization_id: true,
          role: true,
          joined_at: true,
          created_at: false,
        }}
        HeaderButtons={MyOrganizationsTableHeaderButtons}
        datatypeLabel="Organization"
        searchColumn={["organization_id", "organization_name"]}
      />
    </ShowCreateOrganizationTriggerContext.Provider>
  );
}

export default MyOrganizationsTable;
