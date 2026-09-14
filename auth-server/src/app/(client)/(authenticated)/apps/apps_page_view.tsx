"use client";

import { useState, type ReactElement } from "react";
import { Card } from "@schemavaults/ui";
import {
  AppsCard,
  OwnerTypeFilter,
  useAppsList,
  useOwnerTypeFilteredResources,
  type OwnerTypeFilterValue,
  type PreloadedAppsTableDataWithDomainRefs,
} from "@schemavaults/auth-ui";
import { useAuth } from "@schemavaults/auth-react-provider";
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

  // Same SWR key as the card's table, so this shares its cached list rather
  // than issuing a second request.
  const auth = useAuth();
  const apps = useAppsList({
    queryType: "accessible",
    initialData: preloaded_apps?.apps,
    authClient: auth.ready ? auth.client.current : undefined,
  });
  const personalApps = useOwnerTypeFilteredResources(apps.data, "user");
  const hasPersonalApps: boolean = (personalApps?.length ?? 0) > 0;
  // The "Personal" filter is pointless when it can never match anything:
  // the user owns no apps and the server does not let them create one.
  const showPersonalFilter: boolean =
    can_create_personal_apps || hasPersonalApps;

  return (
    <PageContainer>
      <div className="flex w-full flex-col gap-4">
        <Card
          className="flex w-full flex-row flex-wrap items-center justify-between gap-2 px-6 py-4"
          data-testid="apps-page-toolbar"
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
