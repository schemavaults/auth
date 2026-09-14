"use client";

import { useState, type ReactElement } from "react";
import { Card } from "@schemavaults/ui";
import {
  ApiServersCard,
  OwnerTypeFilter,
  useApiServersList,
  useOwnerTypeFilteredResources,
  type OwnerTypeFilterValue,
  type PreloadedApiServersTableDataWithDomainRefs,
} from "@schemavaults/auth-ui";
import { useAuth } from "@schemavaults/auth-react-provider";
import PageContainer from "@/components/PageContainer";
import uuidSync from "@/lib/uuid/uuidSync";
import { useAuthServerFriendlyName } from "@/components/Wordmark";

export interface ApisPageViewProps {
  /**
   * SSR-preloaded API servers the current user can access; the card
   * fetches from GET /api/apis?list_apis_query_type=accessible client-side
   * when absent.
   */
  preloaded_api_servers?: PreloadedApiServersTableDataWithDomainRefs;
  /** Ids of the organizations in which the user is an owner/admin. */
  managed_organization_ids: readonly string[];
  /**
   * Whether the user may create API servers owned by their own account
   * (false when the `allow_user_owned_resource_creation` server setting is
   * disabled and the user is not an admin). Hides the "Create API" button
   * when false.
   */
  can_create_personal_api_servers: boolean;
  /** Whether the viewer is a global admin (enables the "Platform" filter). */
  is_admin: boolean;
}

export default function ApisPageView({
  preloaded_api_servers,
  managed_organization_ids,
  can_create_personal_api_servers,
  is_admin,
}: ApisPageViewProps): ReactElement {
  const friendlyName: string = useAuthServerFriendlyName();
  const [ownerTypeFilter, setOwnerTypeFilter] =
    useState<OwnerTypeFilterValue>("all");

  // Same SWR key as the card's table, so this shares its cached list rather
  // than issuing a second request.
  const auth = useAuth();
  const apiServers = useApiServersList({
    queryType: "accessible",
    initialData: preloaded_api_servers?.api_servers,
    authClient: auth.ready ? auth.client.current : undefined,
  });
  const personalApiServers = useOwnerTypeFilteredResources(
    apiServers.data,
    "user",
  );
  const hasPersonalApiServers: boolean =
    (personalApiServers?.length ?? 0) > 0;
  // The "Personal" filter is pointless when it can never match anything:
  // the user owns no API servers and the server does not let them create one.
  const showPersonalFilter: boolean =
    can_create_personal_api_servers || hasPersonalApiServers;

  return (
    <PageContainer>
      <div className="flex w-full flex-col gap-4">
        <Card
          className="flex w-full flex-row flex-wrap items-center justify-between gap-2 px-6 py-4"
          data-testid="apis-page-toolbar"
        >
          <p className="text-sm text-muted-foreground">
            Filter by owner
          </p>
          <OwnerTypeFilter
            value={ownerTypeFilter}
            onValueChange={setOwnerTypeFilter}
            showPersonal={showPersonalFilter}
            showPlatform={is_admin}
          />
        </Card>
        <ApiServersCard
          cardTitle="API Servers"
          cardDescription={`Backend API servers you own or can access — registered to your account, to one of your organizations${is_admin ? `, or to the ${friendlyName} platform` : ""}. Personal API servers are created here; organization API servers from the organization's page.`}
          cardClassName="w-full"
          queryType="accessible"
          preloaded={preloaded_api_servers}
          managedOrganizationIds={managed_organization_ids}
          ownerTypeFilter={ownerTypeFilter}
          canCreate={
            can_create_personal_api_servers &&
            (ownerTypeFilter === "all" || ownerTypeFilter === "user")
          }
          showConnectAppToApi
          uuid={uuidSync}
        />
      </div>
    </PageContainer>
  );
}
