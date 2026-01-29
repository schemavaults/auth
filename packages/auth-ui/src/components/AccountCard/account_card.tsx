"use client";

import type { PropsWithChildren, ReactElement, ReactNode, FC } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  KeyValueWithSkeleton,
  cn,
} from "@schemavaults/ui";
import type { UserData } from "@schemavaults/auth-react-provider";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import SignOutButton from "@/components/SignOutButton";
import ViewFullUserProfileButton from "./view_full_user_profile";
import ViewAdminDashboardButton from "./view_admin_page_link";
import {
  getHardcodedClientWebAppDomain,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { Building2 } from "lucide-react";

export interface AccountDetailsCardProps {
  cardClassName?: string;
  redirect: (url: string) => Promise<void>;
  isAuthServerAccountPage?: boolean;
  Link: ({ href, children }: PropsWithChildren<{ href: string }>) => ReactNode;
  isAdmin: boolean;
  appEnvironment: SchemaVaultsAppEnvironment;
  user: UserData | null;
  organizations?: readonly OrganizationDefinition[];
}

export function AccountDetailsCard(
  props: AccountDetailsCardProps,
): ReactElement {
  const currentUser = props.user;
  const Link: FC<PropsWithChildren<{ href: string }>> = props.Link;

  const auth_server_uri: string = getHardcodedClientWebAppDomain(
    SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    props.appEnvironment,
  );

  const cardClassName: string = cn("w-full", props.cardClassName);

  const showLinkToAuthServerAccountPage: boolean =
    !props.isAuthServerAccountPage;

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>Account Details</CardTitle>
        <CardDescription>
          View and manage your SchemaVaults account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-start justify-start gap-2">
          <KeyValueWithSkeleton label="User ID" value={currentUser?.uid} />
          <KeyValueWithSkeleton label="Email" value={currentUser?.email} />

          {/** User Organizations */}
          {props.isAuthServerAccountPage && (
            <div className="flex flex-row items-center justify-start gap-2 flex-wrap">
              <h3 className="text-lg font-bold">Organizations:</h3>
              {props.organizations && props.organizations.length > 0 ? (
                <>
                  {props.organizations.map((org) => (
                    <Link
                      key={org.organization_id}
                      href={`/org/${org.organization_id}`}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex flex-row flex-nowrap gap-2"
                      >
                        <Building2 className="h-4 w-4" />
                        {org.name}
                      </Button>
                    </Link>
                  ))}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No organizations
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex flex-row items-start justify-start flex-wrap gap-2">
          <SignOutButton Link={props.Link} />
          {showLinkToAuthServerAccountPage && (
            <ViewFullUserProfileButton
              navigate={async () => {
                const accountUrl =
                  `${auth_server_uri}/account` as const satisfies string;
                await props.redirect(accountUrl);
              }}
            />
          )}
          <ViewAdminDashboardButton
            navigate={async () => {
              const accountUrl = `${auth_server_uri}/admin` as const;
              await props.redirect(accountUrl);
            }}
            admin={props.isAdmin}
          />
        </div>
      </CardFooter>
    </Card>
  );
}

export default AccountDetailsCard;
