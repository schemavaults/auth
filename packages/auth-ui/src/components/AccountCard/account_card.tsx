"use client";

import type { PropsWithChildren, ReactElement, ReactNode } from "react";
import {
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
import SignOutButton from "@/components/SignOutButton";
import ViewFullUserProfileButton from "./view_full_user_profile";
import ViewAdminDashboardButton from "./view_admin_page_link";
import {
  getHardcodedClientWebAppDomain,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export interface AccountDetailsCardProps {
  cardClassName?: string;
  redirect: (url: string) => Promise<void>;
  isAuthServerAccountPage?: boolean;
  Link: ({ href, children }: PropsWithChildren<{ href: string }>) => ReactNode;
  isAdmin: boolean;
  appEnvironment: SchemaVaultsAppEnvironment;
  user: UserData | null;
}

export function AccountDetailsCard(
  props: AccountDetailsCardProps,
): ReactElement {
  const currentUser = props.user;

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
        <div className="flex flex-col items-start justify-start">
          <KeyValueWithSkeleton label="User ID" value={currentUser?.uid} />
          <KeyValueWithSkeleton label="Email" value={currentUser?.email} />
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
