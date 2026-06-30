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
  useToast,
} from "@schemavaults/ui";
import {
  useMyOrganizations,
  type UserData,
} from "@schemavaults/auth-react-provider";
import {
  MAXIMUM_USER_ORGANIZATIONS,
  type OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common";
import SignOutButton from "@/components/SignOutButton";
import ViewFullUserProfileButton from "./view_full_user_profile";
import ViewAdminDashboardButton from "./view_admin_page_link";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { Building2, Plus } from "lucide-react";

export interface AccountDetailsCardProps {
  cardClassName?: string;
  redirect: (url: string) => Promise<void>;
  isAuthServerAccountPage?: boolean;
  Link: ({ href, children }: PropsWithChildren<{ href: string }>) => ReactNode;
  isAdmin: boolean;
  appEnvironment: SchemaVaultsAppEnvironment;
  auth_server_url: string;
  user: UserData | null;
  /**
   * Optional SSR-preloaded organization memberships for the current user.
   * Used as SWR `fallbackData` for `useMyOrganizations` so the card renders
   * the user's orgs on first paint instead of waiting for the client-side
   * fetch of `/api/me/organizations`.
   */
  preloaded_memberships?: readonly OrganizationMembershipRoleDetails[];
}

export function AccountDetailsCard(
  props: AccountDetailsCardProps,
): ReactElement {
  const currentUser = props.user;
  const Link: FC<PropsWithChildren<{ href: string }>> = props.Link;

  const cardClassName: string = cn("w-full", props.cardClassName);

  const showLinkToAuthServerAccountPage: boolean =
    !props.isAuthServerAccountPage;

  const { toast } = useToast();
  const { data: memberships } = useMyOrganizations({
    enabled: !!props.isAuthServerAccountPage,
    initialData: props.isAuthServerAccountPage
      ? props.preloaded_memberships
      : undefined,
    onError: (error: unknown) => {
      toast({
        variant: "destructive",
        title: "Error loading organizations",
        description: `${error instanceof Error ? error.message : "An unknown error occurred."}`,
      });
    },
  });

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
              {memberships && memberships.length > 0 ? (
                <>
                  {memberships.map((membership) => (
                    <Link
                      key={membership.organization_id}
                      href={`/org/${membership.organization_id}`}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex flex-row flex-nowrap gap-2"
                      >
                        <Building2 className="h-4 w-4" />
                        {membership.organization_name}
                        {membership.role && (
                          <span className="text-xs text-muted-foreground">
                            ({membership.role})
                          </span>
                        )}
                      </Button>
                    </Link>
                  ))}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No organizations
                </p>
              )}
              {(!memberships ||
                memberships.length < MAXIMUM_USER_ORGANIZATIONS) && (
                <Link href="/org/new">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex flex-row flex-nowrap gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create Organization
                  </Button>
                </Link>
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
                const accountUrl: string = new URL(
                  "/account",
                  props.auth_server_url,
                ).toString();
                await props.redirect(accountUrl);
              }}
            />
          )}
          <ViewAdminDashboardButton
            navigate={async () => {
              const adminUrl: string = new URL(
                "/admin",
                props.auth_server_url,
              ).toString();
              await props.redirect(adminUrl);
            }}
            admin={props.isAdmin}
          />
        </div>
      </CardFooter>
    </Card>
  );
}

export default AccountDetailsCard;
