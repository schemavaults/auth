"use client";

import { useEffect, type ReactElement } from "react";
import { ToggleGroup, ToggleGroupItem, cn } from "@schemavaults/ui";
import type {
  ResourceOwnerType,
  ResourceOwnershipFields,
} from "@schemavaults/app-definitions";
import { resolveResourceOwnership } from "@schemavaults/app-definitions";
import { Building2, Layers, Server, User as UserIcon } from "lucide-react";
import { useAuthUiFriendlyName } from "@/components/FriendlyNameProvider";
import { useAuthUiOwnerOrganizationId } from "@/components/OwnerOrganizationProvider";

/**
 * "all" shows every listed resource; any other value keeps only resources
 * whose resolved `owner_type` matches.
 */
export type OwnerTypeFilterValue = "all" | ResourceOwnerType;

export const OWNER_TYPE_FILTER_VALUES = [
  "all",
  "user",
  "organization",
  "platform",
] as const satisfies readonly OwnerTypeFilterValue[];

export function isOwnerTypeFilterValue(
  value: unknown,
): value is OwnerTypeFilterValue {
  return (
    typeof value === "string" &&
    (OWNER_TYPE_FILTER_VALUES as readonly string[]).includes(value)
  );
}

/**
 * @description Applies an owner-type filter to a list of app/API server
 * definitions. Definitions whose ownership cannot be resolved are kept
 * under "all" and dropped under a specific filter.
 */
export function filterByOwnerType<T extends ResourceOwnershipFields>(
  resources: readonly T[],
  filter: OwnerTypeFilterValue,
  platform_owner_organization_id: string,
): readonly T[] {
  if (filter === "all") {
    return resources;
  }
  return resources.filter((resource) => {
    try {
      return (
        resolveResourceOwnership(resource, { platform_owner_organization_id })
          .owner_type === filter
      );
    } catch {
      return false;
    }
  });
}

/**
 * @description Applies {@link filterByOwnerType} with the platform owner
 * organization id from context.
 */
export function useOwnerTypeFilteredResources<
  T extends ResourceOwnershipFields,
>(
  resources: readonly T[] | undefined,
  filter: OwnerTypeFilterValue | undefined,
): readonly T[] | undefined {
  const platformOrganizationId: string = useAuthUiOwnerOrganizationId();
  if (!resources || !filter || filter === "all") {
    return resources;
  }
  return filterByOwnerType(resources, filter, platformOrganizationId);
}

export interface OwnerTypeFilterProps {
  value: OwnerTypeFilterValue;
  onValueChange: (value: OwnerTypeFilterValue) => void;
  /**
   * Whether to offer the "Personal" option (default true). Pages hide it
   * when the viewer owns no personal resources and the server does not let
   * them create any, so the filter never offers an always-empty view.
   */
  showPersonal?: boolean;
  /**
   * Whether to offer the "Platform" option. Only global admins can see
   * platform-owned resources, so pages hide it for everyone else.
   */
  showPlatform?: boolean;
  className?: string;
  /** Test/automation hook; defaults to "owner-type-filter". */
  id?: string;
}

/**
 * @description A single-select toggle group for filtering listed apps / API
 * servers by who owns them: all, the current user's own account, one of
 * their organizations, or the platform.
 */
export function OwnerTypeFilter({
  value,
  onValueChange,
  showPersonal = true,
  showPlatform = false,
  className,
  id = "owner-type-filter",
}: OwnerTypeFilterProps): ReactElement {
  const friendlyName: string = useAuthUiFriendlyName();
  const itemClassName = "flex flex-row flex-nowrap items-center gap-2";

  // A selection whose option is no longer offered (e.g. the last personal
  // app was deleted and the user cannot create another) falls back to "all"
  // so the list never stays filtered by a hidden option.
  const isValueHidden: boolean =
    (value === "user" && !showPersonal) ||
    (value === "platform" && !showPlatform);
  useEffect(() => {
    if (isValueHidden) {
      onValueChange("all");
    }
  }, [isValueHidden, onValueChange]);

  return (
    <ToggleGroup
      id={id}
      type="single"
      value={value}
      onValueChange={(next: string): void => {
        // Radix-style toggle groups emit "" when the active item is
        // clicked again; keep the current selection in that case.
        if (isOwnerTypeFilterValue(next)) {
          onValueChange(next);
        }
      }}
      variant="outline"
      size="sm"
      className={cn("flex flex-row flex-wrap gap-1", className)}
      aria-label="Filter by owner"
    >
      <ToggleGroupItem
        value="all"
        className={itemClassName}
        data-testid={`${id}-all`}
      >
        <Layers className="h-4 w-4" /> All
      </ToggleGroupItem>
      {showPersonal && (
        <ToggleGroupItem
          value="user"
          className={itemClassName}
          data-testid={`${id}-user`}
          title="Owned by your account"
        >
          <UserIcon className="h-4 w-4" /> Personal
        </ToggleGroupItem>
      )}
      <ToggleGroupItem
        value="organization"
        className={itemClassName}
        data-testid={`${id}-organization`}
        title="Owned by one of your organizations"
      >
        <Building2 className="h-4 w-4" /> Organization
      </ToggleGroupItem>
      {showPlatform && (
        <ToggleGroupItem
          value="platform"
          className={itemClassName}
          data-testid={`${id}-platform`}
          title={`Owned by the ${friendlyName} platform`}
        >
          <Server className="h-4 w-4" /> Platform
        </ToggleGroupItem>
      )}
    </ToggleGroup>
  );
}

export default OwnerTypeFilter;
