"use client";

import { useState, useTransition, type FC, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY,
  type ApiServerId,
  type OrganizationMembershipVisibility,
} from "@schemavaults/app-definitions";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Switch,
  cn,
  useToast,
} from "@schemavaults/ui";
import { useAuth } from "@schemavaults/auth-react-provider";
import { ShieldAlert } from "lucide-react";

export interface ApiServerOrganizationMembershipCardProps {
  api_server_id: ApiServerId;
  organization_membership_visibility: OrganizationMembershipVisibility;
  /** The organization the API server can always see (its owner), if any. */
  owner_organization_id: string | null;
  /** Whether the viewer may change the visibility (platform administrators only). */
  canChange: boolean;
}

/**
 * Shows, and lets platform administrators change, which organizations'
 * memberships an API server may look up on the auth server's
 * resource-server endpoints: only its owning organization (the default), or
 * every organization for multi-tenant platform services. Lookups outside
 * the owning organization are always bound to the user's own access token
 * for the API server. Styled as a danger zone: widening an API server that
 * is not a platform service leaks its users' memberships across the platform.
 */
export const ApiServerOrganizationMembershipCard: FC<ApiServerOrganizationMembershipCardProps> = ({
  api_server_id,
  organization_membership_visibility,
  owner_organization_id,
  canChange,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [visibility, setVisibility] = useState<OrganizationMembershipVisibility>(
    organization_membership_visibility ?? DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY,
  );

  function save(next: OrganizationMembershipVisibility): void {
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        const updated = await authClient.setApiServerOrganizationMembershipVisibility(
          api_server_id,
          next,
        );
        setVisibility(
          updated.organization_membership_visibility ?? DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY,
        );
        toast({
          variant: "default",
          title: "Organization membership visibility updated",
        });
        router.refresh();
      } catch (e: unknown) {
        console.error("Failed to update the organization membership visibility:", e);
        setVisibility(organization_membership_visibility ?? DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY);
        toast({
          variant: "destructive",
          title: "Failed to update the organization membership visibility",
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  return (
    <Card className="border-destructive/50" data-testid="api-server-organization-membership-card">
      <CardHeader>
        <div className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-row items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Organization Memberships
          </CardTitle>
          <Badge variant="destructive" data-testid="api-server-organization-membership-admin-only-badge">
            Platform admins only
          </Badge>
        </div>
        <CardDescription>
          Which organizations this API server may ask the auth server about
          when it checks a user&apos;s role or lists a user&apos;s
          organizations. By default it only sees its own organization
          {owner_organization_id ? (
            <>
              {" "}
              (<code>{owner_organization_id}</code>)
            </>
          ) : null}
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "flex flex-row items-center justify-between gap-4 rounded-md border border-destructive/50 p-3",
            visibility === "all_organizations" && "bg-destructive/10",
          )}
        >
          <div className="space-y-2">
            <Label htmlFor="all-organizations-membership-switch" className="font-medium">
              Look up memberships in all organizations
            </Label>
            <p className="text-sm text-muted-foreground">
              Lets this API server learn which organizations its users
              belong to, and their roles, across the whole platform. Only
              turn this on for a multi-tenant platform service run by the
              platform administrators, never for an API server run by an
              organization or a user. Lookups outside the API server&apos;s
              own organization are only answered for a user who presents an
              active access token for this API server.
            </p>
            {canChange ? null : (
              <p className="text-sm font-medium text-destructive">
                Only platform administrators can change this setting.
              </p>
            )}
          </div>
          <Switch
            id="all-organizations-membership-switch"
            data-testid="all-organizations-membership-switch"
            className="data-[state=checked]:bg-destructive"
            checked={visibility === "all_organizations"}
            disabled={!canChange || busy}
            onCheckedChange={(checked: boolean) => {
              const next: OrganizationMembershipVisibility = checked
                ? "all_organizations"
                : "owning_organization";
              setVisibility(next);
              save(next);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ApiServerOrganizationMembershipCard;
