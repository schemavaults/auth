"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Wordmark,
  useToast,
  type DashboardSidebarItemDefinition,
  type DashboardSidebarItemGroupDefinition,
} from "@schemavaults/ui";
import { Send } from "lucide-react";
import Link from "next/link";
import { type ReactElement, useCallback, useTransition } from "react";
import PageContainer from "@/components/PageContainer";
import getAuthenticatedUserDashboardLinks from "../dashboard-links";

export default function AdminPageView(): ReactElement {
  const { toast } = useToast();
  const [sendingReport, startSendingReport] = useTransition();

  const adminLinks: readonly DashboardSidebarItemDefinition[] =
    getAuthenticatedUserDashboardLinks(true)
      .filter(
        (entry): entry is DashboardSidebarItemGroupDefinition =>
          entry.type === "dashboard-sidebar-item-group" &&
          entry.adminOnly === true,
      )
      .flatMap((group) => group.items)
      .filter((item) => item.url !== "/admin");

  const handleSendDailyReport = useCallback((): void => {
    startSendingReport(async () => {
      try {
        const response = await fetch("/api/admin/send-daily-report", {
          method: "POST",
          credentials: "include",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.ok !== true) {
          throw new Error(
            body.message ?? `Request failed with status ${response.status}`,
          );
        }
        toast({
          title: "Daily report sent",
          description: `Emailed admin mailing list: ${body.users_count} new sign-ups, ${body.errors_count} new errors in the last 24 hours.`,
        });
      } catch (e: unknown) {
        console.error("Failed to send daily admin report:", e);
        toast({
          variant: "destructive",
          title: "Failed to send daily report",
          description:
            e instanceof Error ? e.message : "An unknown error occurred",
        });
      }
    });
  }, [toast]);

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
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

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Daily admin report</CardTitle>
            <CardDescription>
              Send the 24-hour recap of new sign-ups and errors to the admin
              mailing list now, in addition to the scheduled daily email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={handleSendDailyReport}
              disabled={sendingReport}
              data-testid="admin-send-daily-report-button"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendingReport ? "Sending..." : "Send daily report now"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
