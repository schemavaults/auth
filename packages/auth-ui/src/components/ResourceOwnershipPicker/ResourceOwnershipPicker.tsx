"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Label,
  RadioCard,
  RadioCardDescription,
  RadioCardGroup,
  RadioCardHeader,
  RadioCardIcon,
  RadioCardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@schemavaults/ui";
import { Building2, Server, User as UserIcon } from "lucide-react";
import { useAuthUiFriendlyName } from "@/components/FriendlyNameProvider";
import {
  CREATABLE_RESOURCE_OWNER_TYPES,
  defaultOrganizationForSelection,
  type CreatableResourceOwnerType,
  type ResourceOwnershipChoices,
  type ResourceOwnershipSelection,
  type ResourceOwnershipUnavailableReason,
} from "./resource-ownership-choices";

export type ResourceOwnershipPickerResourceKind = "app" | "api-server";

const RESOURCE_NOUNS: Record<
  ResourceOwnershipPickerResourceKind,
  { singular: string; plural: string }
> = {
  app: { singular: "app", plural: "apps" },
  "api-server": { singular: "API server", plural: "API servers" },
};

function isCreatableResourceOwnerType(
  value: string,
): value is CreatableResourceOwnerType {
  return (CREATABLE_RESOURCE_OWNER_TYPES as readonly string[]).includes(value);
}

function unavailableReasonText(
  reason: ResourceOwnershipUnavailableReason,
  nounPlural: string,
): string {
  switch (reason) {
    case "personal-creation-disabled":
      return `An administrator has turned off personal ${nounPlural} on this server.`;
    case "account-loading":
      return "Loading your account…";
    case "organizations-loading":
      return "Loading your organizations…";
    case "organizations-error":
      return "Couldn't load your organizations.";
    case "not-organization-admin":
      return `Only an organization's owners and admins can add ${nounPlural} to it.`;
    case "no-organizations":
      return "You aren't a member of any organization.";
  }
}

export interface ResourceOwnershipPickerProps {
  /** The owners offered (see `useResourceOwnershipChoices()`). */
  choices: ResourceOwnershipChoices;
  /** The picked owner; `null` when no owner is available at all. */
  value: ResourceOwnershipSelection | null;
  onValueChange: (value: ResourceOwnershipSelection) => void;
  /** What is being created; used in the copy. */
  resourceKind: ResourceOwnershipPickerResourceKind;
  disabled?: boolean;
  /** Error shown under the organization select (e.g. none chosen). */
  organizationError?: string;
  className?: string;
  /**
   * Prefix of the element ids / test ids (`<id>-user`, `<id>-organization`,
   * `<id>-platform`, `<id>-organization-select`, `<id>-summary`).
   */
  id?: string;
}

/**
 * @description The "Owner" field of the create app / API server dialogs: a
 * radio card per owner type (Personal / Organization / Platform) plus an
 * organization select, and a sentence stating who will own the new
 * resource. Owners the viewer can never use are hidden (Platform for
 * non-admins); owners they cannot use right now are disabled with the
 * reason.
 */
export function ResourceOwnershipPicker({
  choices,
  value,
  onValueChange,
  resourceKind,
  disabled = false,
  organizationError,
  className,
  id = "resource-ownership",
}: ResourceOwnershipPickerProps): ReactElement {
  const friendlyName: string = useAuthUiFriendlyName();
  const noun = RESOURCE_NOUNS[resourceKind];
  const labelId = `${id}-label`;
  const organizationSelectId = `${id}-organization-select`;
  const organizationErrorId = `${id}-organization-error`;

  const options: Record<
    CreatableResourceOwnerType,
    { title: string; description: string; icon: ReactNode }
  > = {
    user: {
      title: "Personal",
      description: "Owned by your account. Only you can manage it.",
      icon: <UserIcon />,
    },
    organization: {
      title: "Organization",
      description:
        "Owned by an organization. Its owners and admins manage it; its members can view it.",
      icon: <Building2 />,
    },
    platform: {
      title: "Platform",
      description: `Owned by the ${friendlyName} platform. Only administrators can manage it.`,
      icon: <Server />,
    },
  };

  const selectedOrganization =
    value?.owner_type === "organization" && value.owner_organization_id
      ? choices.organizations.find(
          (o) => o.organization_id === value.owner_organization_id,
        )
      : undefined;

  let summary: ReactNode;
  switch (value?.owner_type) {
    case "user":
      summary = (
        <>
          This {noun.singular} will be owned by{" "}
          <span className="font-medium text-foreground">your account</span>.
        </>
      );
      break;
    case "organization":
      summary = selectedOrganization ? (
        <>
          This {noun.singular} will be owned by{" "}
          <span className="font-medium text-foreground">
            {selectedOrganization.organization_name ??
              selectedOrganization.organization_id}
          </span>
          .
        </>
      ) : (
        <>Choose the organization that will own this {noun.singular}.</>
      );
      break;
    case "platform":
      summary = (
        <>
          This {noun.singular} will be owned by the{" "}
          <span className="font-medium text-foreground">
            {friendlyName} platform
          </span>
          .
        </>
      );
      break;
    default:
      summary = <>You can&apos;t create {noun.plural} for any owner.</>;
  }

  return (
    <div className={cn("space-y-2", className)} data-testid={id}>
      <p id={labelId} className="text-sm font-medium leading-none">
        Owner
      </p>
      <RadioCardGroup
        aria-labelledby={labelId}
        value={value?.owner_type ?? ""}
        onValueChange={(next: string): void => {
          if (!isCreatableResourceOwnerType(next)) {
            return;
          }
          onValueChange({
            owner_type: next,
            owner_organization_id:
              next === "organization"
                ? value?.owner_type === "organization" &&
                  value.owner_organization_id
                  ? value.owner_organization_id
                  : defaultOrganizationForSelection(choices)
                : null,
          });
        }}
        disabled={disabled}
        size="sm"
        className="gap-2"
      >
        {CREATABLE_RESOURCE_OWNER_TYPES.map((owner_type) => {
          const state = choices[owner_type];
          if (state.status === "hidden") {
            return null;
          }
          const option = options[owner_type];
          return (
            <RadioCard
              key={owner_type}
              value={owner_type}
              id={`${id}-${owner_type}`}
              data-testid={`${id}-${owner_type}`}
              data-availability={state.status}
              disabled={disabled || state.status === "disabled"}
            >
              <RadioCardHeader>
                <RadioCardIcon>{option.icon}</RadioCardIcon>
                <div className="flex flex-col gap-1 pr-6">
                  <RadioCardTitle>{option.title}</RadioCardTitle>
                  <RadioCardDescription>
                    {state.status === "disabled"
                      ? unavailableReasonText(state.reason, noun.plural)
                      : option.description}
                  </RadioCardDescription>
                </div>
              </RadioCardHeader>
            </RadioCard>
          );
        })}
      </RadioCardGroup>
      {value?.owner_type === "organization" && (
        <div className="space-y-2 pt-1">
          <Label htmlFor={organizationSelectId}>Organization</Label>
          <Select
            value={value.owner_organization_id ?? ""}
            onValueChange={(organization_id: string): void => {
              onValueChange({ owner_type: "organization", owner_organization_id: organization_id });
            }}
            disabled={disabled}
          >
            <SelectTrigger
              id={organizationSelectId}
              data-testid={organizationSelectId}
              className="w-full"
              aria-invalid={organizationError ? true : undefined}
              aria-describedby={organizationError ? organizationErrorId : undefined}
            >
              <SelectValue placeholder="Choose an organization" />
            </SelectTrigger>
            <SelectContent>
              {choices.organizations.map((organization) => (
                <SelectItem
                  key={organization.organization_id}
                  value={organization.organization_id}
                  data-testid={`${organizationSelectId}-option-${organization.organization_id}`}
                >
                  {organization.organization_name ??
                    organization.organization_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {organizationError && (
            <p
              id={organizationErrorId}
              className="text-sm font-medium text-destructive"
            >
              {organizationError}
            </p>
          )}
        </div>
      )}
      <p
        id={`${id}-summary`}
        data-testid={`${id}-summary`}
        data-owner-type={value?.owner_type ?? ""}
        className="text-sm text-muted-foreground"
        aria-live="polite"
      >
        {/* The organization error already asks for an organization. */}
        {organizationError ? null : summary}
      </p>
    </div>
  );
}

export default ResourceOwnershipPicker;
