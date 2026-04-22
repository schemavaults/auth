"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Wordmark,
  type DashboardSidebarItemDefinition,
  type DashboardSidebarItemGroupDefinition,
} from "@schemavaults/ui";
import Link from "next/link";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import getAuthenticatedUserDashboardLinks from "../dashboard-links";

export default function AdminPageView(): ReactElement {
  const adminLinks: readonly DashboardSidebarItemDefinition[] =
    getAuthenticatedUserDashboardLinks(true)
      .filter(
        (entry): entry is DashboardSidebarItemGroupDefinition =>
          entry.type === "dashboard-sidebar-item-group" &&
          entry.adminOnly === true,
      )
      .flatMap((group) => group.items)
      .filter((item) => item.url !== "/admin");

  return (
    <PageContainer>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">
            <Wordmark /> Admin Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {adminLinks.map(({ url, title, icon: Icon }) => (
              <Button
                key={url}
                asChild
                variant="outline"
                className="justify-start h-auto py-3"
              >
                <Link href={url}>
                  <Icon className="w-5 h-5 mr-2" />
                  <span>{title}</span>
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
