"use client";

import { useState, useTransition, type FC, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AppId } from "@schemavaults/app-definitions";
import {
  assignableOrganizationMembershipRoles,
  type AssignableOrganizationMembershipRole,
} from "@schemavaults/auth-common";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "@schemavaults/ui";
import { useAuth } from "@schemavaults/auth-react-provider";
import { LocalDateTime } from "@schemavaults/auth-ui";
import { Bot, Building2, Save, Trash2 } from "lucide-react";
import type { ServiceAccountOrganizationMembershipSummary } from "@/lib/ownership/service-account-organization-membership";

/** Select value for "not a member" (roles are the other values). */
const NOT_A_MEMBER = "none";

const ORGANIZATION_ROLE_LABELS: Record<AssignableOrganizationMembershipRole, string> = {
  member: "Member",
  owner: "Owner",
};

function isAssignableRole(value: string): value is AssignableOrganizationMembershipRole {
  return (assignableOrganizationMembershipRoles as readonly string[]).includes(value);
}

interface OrganizationRoleFormProps {
  organization_id: string;
  /** The saved role, or NOT_A_MEMBER. */
  saved_role: string;
  busy: boolean;
  onSave: (role: string) => void;
}

/**
 * Role select of the service account in the owning organization. Picking
 * a role only changes the selection: nothing is sent until "Save". The
 * card keys it on the saved role, so the selection resets whenever the
 * saved role changes.
 */
const OrganizationRoleForm: FC<OrganizationRoleFormProps> = ({
  organization_id,
  saved_role,
  busy,
  onSave,
}): ReactElement => {
  const [selected_role, setSelectedRole] = useState<string>(saved_role);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="service-account-organization-role">
        Role in {organization_id}
      </Label>
      <div className="flex flex-row flex-wrap items-center gap-2">
        <Select
          value={selected_role}
          onValueChange={setSelectedRole}
          disabled={busy}
        >
          <SelectTrigger
            id="service-account-organization-role"
            className="w-56"
            data-testid="service-account-organization-role"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value={NOT_A_MEMBER}
              data-testid={`service-account-organization-role-option-${NOT_A_MEMBER}`}
            >
              Not a member
            </SelectItem>
            {assignableOrganizationMembershipRoles.map(
              (role: AssignableOrganizationMembershipRole): ReactElement => (
                <SelectItem
                  key={role}
                  value={role}
                  data-testid={`service-account-organization-role-option-${role}`}
                >
                  {ORGANIZATION_ROLE_LABELS[role]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Button
          disabled={busy || selected_role === saved_role}
          onClick={() => onSave(selected_role)}
          data-testid="service-account-organization-role-save"
        >
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  );
};

export interface AppServiceAccountCardProps {
  app_id: AppId;
  /** Null until the first client_credentials grant or explicit creation. */
  service_account: {
    uid: string;
    email: string;
    created_at: number;
    disabled: boolean;
  } | null;
  /**
   * Whether the service account is a member of the organization that owns
   * the app (only organization-owned apps offer the setting).
   */
  organization_membership: ServiceAccountOrganizationMembershipSummary;
  /** Whether the app is a confidential client (may use the grant). */
  has_client_secret: boolean;
  /** Whether the viewer may create/remove the service account. */
  canManage: boolean;
}

/**
 * Management card for a client application's service account: the
 * machine identity that access tokens obtained through the OAuth2
 * client_credentials grant are issued to. The grant is only available
 * to confidential clients, so the card points at the client secret card
 * when the app has none. For an organization-owned app, once the service
 * account exists, the card also makes it a member of that organization
 * (service accounts cannot accept invitations), so resource servers that
 * require organization membership accept its tokens.
 */
export const AppServiceAccountCard: FC<AppServiceAccountCardProps> = ({
  app_id,
  service_account,
  organization_membership,
  has_client_secret,
  canManage,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  function runMutation(action: "create" | "remove"): void {
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        if (action === "create") {
          const result =
            await authClient.createClientApplicationServiceAccount(app_id);
          toast({
            variant: "default",
            title: result.created
              ? "Service account created"
              : "Service account already exists",
            description: result.message,
          });
        } else {
          await authClient.deleteClientApplicationServiceAccount(app_id);
          toast({
            variant: "default",
            title: "Service account removed",
            description:
              "The next client credentials grant will create a new one.",
          });
        }
        router.refresh();
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title:
            action === "create"
              ? "Failed to create service account"
              : "Failed to remove service account",
          description:
            e instanceof Error ? e.message : "Failed to send network request",
        });
      }
    });
  }

  const saved_role: string = organization_membership.role ?? NOT_A_MEMBER;

  function saveOrganizationRole(value: string): void {
    if (value === saved_role) {
      return;
    }
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        const result = isAssignableRole(value)
          ? await authClient.setClientApplicationServiceAccountOrganizationMembership(
              app_id,
              value,
            )
          : await authClient.deleteClientApplicationServiceAccountOrganizationMembership(
              app_id,
            );
        toast({
          variant: "default",
          title: "Organization membership updated",
          description: result.message,
        });
        router.refresh();
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to update organization membership",
          description:
            e instanceof Error ? e.message : "Failed to send network request",
        });
      }
    });
  }

  const organization_id: string | null = organization_membership.organization_id;

  return (
    <Card data-testid="app-service-account-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Service Account
        </CardTitle>
        <CardDescription>
          Machine-to-machine access tokens obtained with the OAuth2 client
          credentials grant (<code>grant_type=client_credentials</code>) are
          issued to this app&apos;s service account instead of a user.
          {!has_client_secret &&
            " The grant requires a confidential client: generate a client secret first."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {service_account ? (
          <div className="space-y-1 text-sm">
            <div className="flex flex-row flex-wrap gap-2">
              <span className="font-medium">Subject (uid):</span>
              <code
                className="break-all rounded bg-muted px-1 text-xs"
                data-testid="service-account-uid"
              >
                {service_account.uid}
              </code>
            </div>
            <div className="flex flex-row flex-wrap gap-2">
              <span className="font-medium">Email:</span>
              <span
                className="text-muted-foreground break-all"
                data-testid="service-account-email"
              >
                {service_account.email}
              </span>
            </div>
            <div className="flex flex-row gap-2">
              <span className="font-medium">Created:</span>
              <LocalDateTime
                value={service_account.created_at}
                showSeconds={false}
                className="text-muted-foreground"
              />
            </div>
            {service_account.disabled && (
              <p className="text-destructive">
                This service account is disabled: client credentials grants
                are refused.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No service account yet. One is created automatically by the first
            successful client credentials grant, or create it now to grant its
            id permissions ahead of time.
          </p>
        )}

        {canManage && (
          <div className="flex flex-row flex-wrap gap-2">
            {!service_account ? (
              <Button disabled={busy} onClick={() => runMutation("create")}>
                <Bot className="h-4 w-4 mr-2" />
                Create service account
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={busy}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove service account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove service account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The service account and its token records will be
                      deleted. Access tokens already issued to it remain valid
                      until they expire. The next client credentials grant
                      creates a new service account with a different id, so
                      any permissions granted to the current id on resource
                      servers will no longer apply.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={busy}
                      onClick={() => runMutation("remove")}
                    >
                      Remove service account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}

        {service_account && organization_membership.available && organization_id !== null && (
          <div
            className="space-y-2 border-t pt-4 text-sm"
            data-testid="service-account-organization-membership"
          >
            <div className="flex items-center gap-2 font-medium">
              <Building2 className="h-4 w-4" />
              Organization membership
            </div>
            <p
              className="text-muted-foreground"
              data-testid="service-account-organization-membership-status"
            >
              {organization_membership.role ? (
                <>
                  The service account is{" "}
                  {organization_membership.role === "owner" ? "an" : "a"}{" "}
                  <span className="font-medium text-foreground">
                    {ORGANIZATION_ROLE_LABELS[organization_membership.role].toLowerCase()}
                  </span>{" "}
                  of{" "}
                  <Link href={`/orgs/${organization_id}`} className="text-primary hover:underline">
                    {organization_id}
                  </Link>
                  , the organization that owns this app: resource servers
                  that require membership of the organization accept its
                  client credentials tokens.
                </>
              ) : (
                <>
                  The service account is not a member of{" "}
                  <Link href={`/orgs/${organization_id}`} className="text-primary hover:underline">
                    {organization_id}
                  </Link>
                  , the organization that owns this app. Service accounts
                  cannot accept invitations: add it here so resource servers
                  that require membership of the organization accept its
                  client credentials tokens.
                </>
              )}
            </p>
            {canManage && (
              <OrganizationRoleForm
                key={saved_role}
                organization_id={organization_id}
                saved_role={saved_role}
                busy={busy}
                onSave={saveOrganizationRole}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AppServiceAccountCard;
