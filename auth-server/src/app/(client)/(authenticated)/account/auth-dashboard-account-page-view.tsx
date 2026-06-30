"use client";

import {
  AccountDetailsCard,
  AppsCard,
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
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@schemavaults/ui";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import uuidSync from "@/lib/uuid/uuidSync";

export interface AuthAccountPageViewProps {
  auth_server_url: string;
  preloaded_authorized_apps_data?: PreloadedAppsTableDataWithDomainRefs;
  preloaded_organization_memberships?: readonly OrganizationMembershipRoleDetails[];
}

export default function AccountPageView({
  auth_server_url,
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
        auth_server_url={auth_server_url}
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
      <Card className={cardsClassName}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            Multi-Factor Authentication
          </CardTitle>
          <CardDescription>
            Manage your authenticator app and passkeys on the dedicated security
            page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add a second factor — an authenticator app or a passkey — to protect
            your account at sign-in.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild className="flex flex-row gap-2 flex-nowrap">
            <Link href="/mfa">
              <ShieldCheck className="h-4 w-4" />
              Manage MFA
            </Link>
          </Button>
        </CardFooter>
      </Card>
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
