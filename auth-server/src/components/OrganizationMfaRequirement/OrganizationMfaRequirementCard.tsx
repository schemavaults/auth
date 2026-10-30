"use client";

import { useState, useTransition, type FC, type ReactElement } from "react";
import Link from "next/link";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from "@schemavaults/ui";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  DEFAULT_ORGANIZATION_MFA_GRACE_PERIOD_DAYS,
  MAX_ORGANIZATION_MFA_GRACE_PERIOD_DAYS,
  MIN_ORGANIZATION_MFA_GRACE_PERIOD_DAYS,
} from "@/lib/organization-mfa-requirements/policy";
import type {
  OrganizationMemberWithoutMfaView,
  OrganizationMfaRequirementView,
} from "@/lib/organization-mfa-requirements/types";

export interface OrganizationMfaRequirementCardProps {
  organization_id: string;
  organization_name: string;
  preloaded: OrganizationMfaRequirementView;
  /** Owners and platform administrators may change the requirement. */
  canManage: boolean;
  /** Whether the viewer holds a membership of the organization (not a platform admin looking in). */
  viewerIsMember: boolean;
}

function MemberStatus({ member }: { member: OrganizationMemberWithoutMfaView }): ReactElement {
  if (member.status === "expired") {
    return (
      <Badge variant="destructive" data-testid="organization-mfa-member-status">
        Grace period ended, removal pending
      </Badge>
    );
  }
  if (member.status === "pending" || member.grace_period_ends_at === null) {
    return (
      <Badge variant="outline" data-testid="organization-mfa-member-status">
        Grace period starting
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" data-testid="organization-mfa-member-status">
      Removed after {new Date(member.grace_period_ends_at).toLocaleString()}
    </Badge>
  );
}

/**
 * Shows an organization's multi-factor authentication requirement and lets
 * its owners (and platform administrators) turn it on or off and choose the
 * grace period members without MFA get. Owners also see those members and
 * when each will be removed.
 */
export const OrganizationMfaRequirementCard: FC<OrganizationMfaRequirementCardProps> = ({
  organization_id,
  organization_name,
  preloaded,
  canManage,
  viewerIsMember,
}): ReactElement => {
  const { toast } = useToast();
  const [busy, startTransition] = useTransition();
  const [requirement, setRequirement] = useState<OrganizationMfaRequirementView>(preloaded);
  const [required, setRequired] = useState<boolean>(preloaded.required);
  const [graceDays, setGraceDays] = useState<string>(
    String(preloaded.grace_period_days ?? DEFAULT_ORGANIZATION_MFA_GRACE_PERIOD_DAYS),
  );

  const parsedGraceDays: number = Number(graceDays);
  const graceDaysValid: boolean =
    Number.isInteger(parsedGraceDays) &&
    parsedGraceDays >= MIN_ORGANIZATION_MFA_GRACE_PERIOD_DAYS &&
    parsedGraceDays <= MAX_ORGANIZATION_MFA_GRACE_PERIOD_DAYS;
  // Turning the requirement on without MFA would start the viewer's own
  // grace period; the server refuses it, so the form does too.
  const viewerMustEnableMfaFirst: boolean =
    required && !requirement.required && viewerIsMember && !requirement.caller_has_mfa;
  const dirty: boolean =
    required !== requirement.required ||
    (required && String(requirement.grace_period_days ?? "") !== graceDays);

  function save(): void {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/organizations/${organization_id}/mfa-requirement`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(required ? { required, grace_period_days: parsedGraceDays } : { required }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) {
          throw new Error(body.message ?? `Failed to update the MFA requirement (status ${response.status})`);
        }
        const updated: OrganizationMfaRequirementView = body.data.requirement;
        setRequirement(updated);
        setRequired(updated.required);
        setGraceDays(String(updated.grace_period_days ?? DEFAULT_ORGANIZATION_MFA_GRACE_PERIOD_DAYS));
        toast({ title: body.message ?? "MFA requirement updated" });
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to update the MFA requirement",
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  const membersWithoutMfa: readonly OrganizationMemberWithoutMfaView[] = requirement.members_without_mfa ?? [];

  return (
    <Card className="w-full" data-testid="organization-mfa-requirement-card">
      <CardHeader>
        <div className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-row items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Multi-factor Authentication
          </CardTitle>
          <Badge
            variant={requirement.required ? "default" : "outline"}
            data-testid="organization-mfa-requirement-status-badge"
          >
            {requirement.required ? "Required" : "Not required"}
          </Badge>
        </div>
        <CardDescription>
          {requirement.required && requirement.required_since !== null ? (
            <>
              {organization_name} has required members to use multi-factor
              authentication (an authenticator app or a passkey) since{" "}
              {new Date(requirement.required_since).toLocaleString()}. Members
              without it get {requirement.grace_period_days} day
              {requirement.grace_period_days === 1 ? "" : "s"} to enable it
              before they are removed from the organization, and users without
              it cannot join.
            </>
          ) : (
            <>
              Require every member of {organization_name} to protect their
              account with multi-factor authentication (an authenticator app or
              a passkey).
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {viewerIsMember && !requirement.caller_has_mfa ? (
          <Alert variant="warning" data-testid="organization-mfa-requirement-viewer-warning">
            <AlertTitle>You don&apos;t use multi-factor authentication</AlertTitle>
            <AlertDescription>
              {requirement.required
                ? "This organization requires it: enable it to keep your membership."
                : "Enable it before requiring it of this organization's members."}{" "}
              <Link href="/mfa" className="underline">
                Set up MFA
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}

        {canManage ? (
          <div className="flex flex-col gap-4 rounded-md border p-3">
            <div className="flex flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="organization-mfa-requirement-switch" className="font-medium">
                  Require multi-factor authentication
                </Label>
                <p className="text-sm text-muted-foreground">
                  Members without MFA are emailed and given a grace period to
                  enable it; whoever hasn&apos;t by then is removed from the
                  organization. Members who later remove their MFA get a new
                  grace period.
                </p>
              </div>
              <Switch
                id="organization-mfa-requirement-switch"
                data-testid="organization-mfa-requirement-switch"
                checked={required}
                disabled={busy}
                onCheckedChange={(checked: boolean) => setRequired(checked)}
              />
            </div>
            {required ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="organization-mfa-grace-period-days">Grace period (days)</Label>
                <Input
                  id="organization-mfa-grace-period-days"
                  data-testid="organization-mfa-grace-period-days-input"
                  type="number"
                  inputMode="numeric"
                  min={MIN_ORGANIZATION_MFA_GRACE_PERIOD_DAYS}
                  max={MAX_ORGANIZATION_MFA_GRACE_PERIOD_DAYS}
                  step={1}
                  className="max-w-32"
                  value={graceDays}
                  disabled={busy}
                  onChange={(e) => setGraceDays(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Between {MIN_ORGANIZATION_MFA_GRACE_PERIOD_DAYS} and{" "}
                  {MAX_ORGANIZATION_MFA_GRACE_PERIOD_DAYS} days.
                  {requirement.required
                    ? " A new length applies to grace periods that start from now on."
                    : null}
                </p>
              </div>
            ) : null}
            <div>
              <Button
                type="button"
                onClick={save}
                disabled={busy || !dirty || (required && !graceDaysValid) || viewerMustEnableMfaFirst}
                data-testid="organization-mfa-requirement-save-button"
              >
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" /> : null}
                Save
              </Button>
            </div>
          </div>
        ) : null}

        {requirement.required && requirement.members_without_mfa !== null ? (
          membersWithoutMfa.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="organization-mfa-all-members-compliant">
              Every member uses multi-factor authentication.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                {membersWithoutMfa.length} member{membersWithoutMfa.length === 1 ? "" : "s"} without
                multi-factor authentication
              </p>
              <Table data-testid="organization-mfa-members-without-mfa-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {membersWithoutMfa.map((member) => (
                    <TableRow key={member.uid} data-testid="organization-mfa-member-row">
                      <TableCell className="break-all">{member.email}</TableCell>
                      <TableCell className="capitalize">{member.role}</TableCell>
                      <TableCell>
                        <MemberStatus member={member} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
};

export default OrganizationMfaRequirementCard;
