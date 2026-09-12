"use client";

import { useState, type ReactElement } from "react";
import {
  AppsCard,
  OwnerTypeFilter,
  type OwnerTypeFilterValue,
  type PreloadedAppsTableDataWithDomainRefs,
} from "@schemavaults/auth-ui";
import PageContainer from "@/components/PageContainer";
import uuidSync from "@/lib/uuid/uuidSync";
import { useAuthServerFriendlyName } from "@/components/Wordmark";

export interface AppsPageViewProps {
  /**
   * SSR-preloaded apps the current user can access; the card fetches from
   * GET /api/apps?list_apps_query_type=accessible client-side when absent.
   */
  preloaded_apps?: PreloadedAppsTableDataWithDomainRefs;
  /** Ids of the organizations in which the user is an owner/admin. */
  managed_organization_ids: readonly string[];
  /**
   * Whether the user may create apps owned by their own account (false when
   * the `allow_user_owned_resource_creation` server setting is disabled and
   * the user is not an admin). Hides the "Create app" button when false.
   */
  can_create_personal_apps: boolean;
  /** Whether the viewer is a global admin (enables the "Platform" filter). */
  is_admin: boolean;
}

export default function AppsPageView({
  preloaded_apps,
  managed_organization_ids,
  can_create_personal_apps,
  is_admin,
}: AppsPageViewProps): ReactElement {
  const friendlyName: string = useAuthServerFriendlyName();
  const [ownerTypeFilter, setOwnerTypeFilter] =
    useState<OwnerTypeFilterValue>("all");

  return (
    <PageContainer>
      <div className="flex w-full flex-col gap-4">
        <div
          className="flex w-full flex-row flex-wrap items-center justify-between gap-2"
          data-testid="apps-page-toolbar"
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
        <AppsCard
          cardTitle="Applications"
          cardDescription={`Client applications you own or can access — registered to your account, to one of your organizations${is_admin ? `, or to the ${friendlyName} platform` : ""}. Personal apps are created here; organization apps from the organization's page.`}
          cardClassName="w-full"
          queryType="accessible"
          preloaded={preloaded_apps}
          managedOrganizationIds={managed_organization_ids}
          ownerTypeFilter={ownerTypeFilter}
          canCreate={
            can_create_personal_apps &&
            (ownerTypeFilter === "all" || ownerTypeFilter === "user")
          }
          uuid={uuidSync}
        />
      </div>
    </PageContainer>
  );
}
