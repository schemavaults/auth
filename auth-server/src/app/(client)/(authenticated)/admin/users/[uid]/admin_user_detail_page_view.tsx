"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@schemavaults/ui";
import { ShieldCheck, ShieldX } from "lucide-react";
import PageContainer from "@/components/PageContainer";
import type { UserData } from "@schemavaults/auth-common";

export interface AdminUserDetailPageViewProps {
  user: UserData;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-border/50 last:border-b-0">
      <span className="w-full sm:w-48 text-sm font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-sm break-all">{children}</span>
    </div>
  );
}

function YesNo({
  value,
  trueColor = "text-green-600",
  falseColor = "text-muted-foreground",
}: {
  value: boolean | undefined;
  trueColor?: string;
  falseColor?: string;
}): ReactElement {
  const v = value === true;
  return (
    <span className={v ? trueColor : falseColor}>{v ? "Yes" : "No"}</span>
  );
}

export function AdminUserDetailPageView({
  user,
}: AdminUserDetailPageViewProps): ReactElement {
  const isAdmin = user.admin === true;
  const createdAt = new Date(user.created_at);

  return (
    <PageContainer>
      <Card className="w-full" data-testid="admin-user-detail-card">
        <CardHeader>
          <CardTitle data-testid="admin-user-detail-email">
            {user.email}
          </CardTitle>
          <CardDescription data-testid="admin-user-detail-uid">
            {user.uid}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="User ID">
            <code>{user.uid}</code>
          </Row>
          <Row label="Email">{user.email}</Row>
          <Row label="Email Verified">
            <YesNo value={user.email_verified} />
          </Row>
          <Row label="Admin">
            <span className="inline-flex items-center gap-1">
              {isAdmin ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                  <span className="text-green-600">Yes</span>
                </>
              ) : (
                <>
                  <ShieldX className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">No</span>
                </>
              )}
            </span>
          </Row>
          <Row label="Disabled">
            <YesNo
              value={user.disabled}
              trueColor="text-red-600"
              falseColor="text-muted-foreground"
            />
          </Row>
          <Row label="Invite Code">
            <span>{user.invite_code ?? "-"}</span>
          </Row>
          <Row label="Created At">
            <span>{createdAt.toLocaleString()}</span>
          </Row>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

export default AdminUserDetailPageView;
