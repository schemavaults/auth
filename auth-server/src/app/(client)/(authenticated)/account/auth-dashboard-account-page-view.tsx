"use client";

import {
  AccountDetailsCard,
  AppsCard,
  MfaSettingsCard,
  PendingInvitationsCard,
} from "@schemavaults/auth-ui";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import type { OrganizationMembershipRoleDetails } from "@schemavaults/auth-common";
import {
  useAdmin,
  useAppEnvironment,
  useCurrentUserWithRevalidation,
} from "@schemavaults/auth-react-provider";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import uuidSync from "@/lib/uuid/uuidSync";

export interface AuthAccountPageViewProps {
  preloaded_authorized_apps_data?: PreloadedAppsTableDataWithDomainRefs;
  preloaded_organization_memberships?: readonly OrganizationMembershipRoleDetails[];
}

export default function AccountPageView({
  preloaded_authorized_apps_data,
  preloaded_organization_memberships,
}: AuthAccountPageViewProps): ReactElement {
  const router = useRouter();
  const environment = useAppEnvironment();
  const admin: boolean = useAdmin();
  const user = useCurrentUserWithRevalidation();

  const cardsClassName = "grow";

  return (
    <PageContainer>
      <AccountDetailsCard
        Link={Link}
        redirect={async (url: string): Promise<void> => {
          if (url.startsWith("https://")) {
            window.location.href = url;
            return;
          } else if (
            url.startsWith("http://") &&
            environment !== "development" &&
            environment !== "test"
          ) {
            // not an appropriate environment to use insecure transport
            console.error(
              "Inappropriate environment to use insecure transport",
            );
            throw new Error("Cannot redirect to http:// url");
          }
          router.push(url);
          return;
        }}
        cardClassName={cardsClassName}
        isAuthServerAccountPage
        isAdmin={admin}
        user={user}
        appEnvironment={environment}
        preloaded_memberships={preloaded_organization_memberships}
      />
      <MfaSettingsCard className={cardsClassName} />
      <PendingInvitationsCard cardClassName={cardsClassName} />
      <AppsCard
        cardTitle="Authorized Applications"
        cardClassName={cardsClassName}
        queryType="authorized"
        preloaded={preloaded_authorized_apps_data}
        uuid={uuidSync}
      />
    </PageContainer>
  );
}
