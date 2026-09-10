"use client";

import { useState, type ReactElement } from "react";
import {
  ApiServersCard,
  OwnerTypeFilter,
  type OwnerTypeFilterValue,
  type PreloadedApiServersTableDataWithDomainRefs,
} from "@schemavaults/auth-ui";
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

  return (
    <PageContainer>
      <div className="flex w-full flex-col gap-4">
        <div
          className="flex w-full flex-row flex-wrap items-center justify-between gap-2"
          data-testid="apis-page-toolbar"
        >
          <p className="text-sm text-muted-foreground">
            Filter by owner
          </p>
          <OwnerTypeFilter
            value={ownerTypeFilter}
            onValueChange={setOwnerTypeFilter}
            showPlatform={is_admin}
          />
        </div>
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
