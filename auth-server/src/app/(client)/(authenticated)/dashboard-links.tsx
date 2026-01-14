import type {
  DashboardSidebarItemDefinition,
  DashboardSidebarItemGroupDefinition,
  DashboardSidebarItemsAndGroupsDefinitions,
} from "@schemavaults/ui";
import {
  AppWindow,
  Server,
  ShieldUser,
  SwatchBook,
  User as UserIcon,
  Users,
} from "lucide-react";
import type { ReactElement } from "react";

export function getAuthenticatedUserDashboardLinks(
  admin: boolean = false,
): DashboardSidebarItemsAndGroupsDefinitions {
  const accountPageLink: DashboardSidebarItemDefinition = {
    type: "dashboard-sidebar-item-definition" as const,
    title: "Account",
    url: "/account",
    icon: ({ className }: { className: string }): ReactElement => (
      <UserIcon className={className} />
    ),
  };

  const dashboardLinks: (
    | DashboardSidebarItemDefinition
    | DashboardSidebarItemGroupDefinition
  )[] = [accountPageLink];

  if (admin) {
    const adminLinkGroup: DashboardSidebarItemGroupDefinition = {
      type: "dashboard-sidebar-item-group" as const,
      title: "Admin Links",
      adminOnly: true,
      items: [
        {
          type: "dashboard-sidebar-item-definition" as const,
          title: "Admin Dashboard",
          url: "/admin",
          icon: ({ className }: { className: string }): ReactElement => (
            <ShieldUser className={className} />
          ),
        },
        {
          type: "dashboard-sidebar-item-definition" as const,
          title: "Users",
          url: "/admin/users",
          icon: ({ className }: { className: string }): ReactElement => (
            <Users className={className} />
          ),
        },
        {
          type: "dashboard-sidebar-item-definition" as const,
          title: "Client Applications",
          url: "/admin/apps",
          icon: ({ className }: { className: string }): ReactElement => (
            <AppWindow className={className} />
          ),
        },
        {
          type: "dashboard-sidebar-item-definition" as const,
          title: "APIs",
          url: "/admin/apis",
          icon: ({ className }: { className: string }): ReactElement => (
            <Server className={className} />
          ),
        },
        {
          type: "dashboard-sidebar-item-definition" as const,
          title: "Invite Codes",
          url: "/admin/invite_codes",
          icon: ({ className }: { className: string }): ReactElement => (
            <SwatchBook className={className} />
          ),
        },
      ],
    };

    dashboardLinks.push(adminLinkGroup);
  }

  return dashboardLinks;
}

export default getAuthenticatedUserDashboardLinks;
