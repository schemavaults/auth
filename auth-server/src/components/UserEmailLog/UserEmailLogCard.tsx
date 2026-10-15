"use client";

import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineDot,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "@schemavaults/ui";
import { KeyRound, Loader2, Mail, type LucideIcon } from "lucide-react";
import { LocalDateTime } from "@schemavaults/auth-ui";
import type {
  UserEmailLogEmailType,
  UserEmailLogEntry,
} from "@/lib/auth-db/user-email-log/user-email-log-table";
import { useUserEmailLog } from "./useUserEmailLog";

export interface UserEmailLogCardProps {
  uid: string;
}

const EMAIL_TYPE_LABELS: Record<UserEmailLogEmailType, string> = {
  email_verification: "Verification email",
  password_reset: "Password reset email",
};

const EMAIL_TYPE_ICONS: Record<UserEmailLogEmailType, LucideIcon> = {
  email_verification: Mail,
  password_reset: KeyRound,
};

function describeSource(entry: UserEmailLogEntry): ReactNode {
  switch (entry.source) {
    case "registration":
      return "Sent at sign-up";
    case "user_request":
      return entry.email_type === "password_reset"
        ? "Requested by the user (forgot password)"
        : "Requested by the user";
    case "admin_request":
      return (
        <>
          Resent by{" "}
          {entry.requested_by ? (
            <Link
              href={`/admin/users/${entry.requested_by}`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              {entry.requested_by_email ?? "an administrator"}
            </Link>
          ) : (
            "an administrator"
          )}
        </>
      );
  }
}

function UserEmailLogTimelineItem({
  entry,
  isLast,
}: {
  entry: UserEmailLogEntry;
  isLast: boolean;
}): ReactElement {
  const failed: boolean = entry.status === "failed";
  const Icon: LucideIcon = EMAIL_TYPE_ICONS[entry.email_type];

  return (
    <TimelineItem
      data-testid="admin-user-email-log-entry"
      data-email-type={entry.email_type}
      data-email-source={entry.source}
      data-email-status={entry.status}
    >
      {/*
        The indicator and connector are stretched explicitly: left at their
        content height the connector collapses to nothing. The indicator's
        negative bottom margin (the item's pb-6) carries the line down to
        the next item's dot.
      */}
      <TimelineIndicator className={isLast ? undefined : "self-stretch -mb-6"}>
        <TimelineDot variant={failed ? "destructive" : "primary"}>
          <Icon />
        </TimelineDot>
        {isLast ? null : <TimelineConnector className="self-stretch my-1" />}
      </TimelineIndicator>
      <TimelineContent>
        <TimelineHeader>
          <TimelineTitle className="flex items-center gap-2">
            {EMAIL_TYPE_LABELS[entry.email_type]}
            <Badge variant={failed ? "destructive" : "secondary"}>
              {failed ? "Failed" : "Sent"}
            </Badge>
          </TimelineTitle>
          <TimelineTime dateTime={new Date(entry.created_at).toISOString()}>
            <LocalDateTime value={entry.created_at} />
          </TimelineTime>
        </TimelineHeader>
        <TimelineDescription className="break-words">
          To {entry.recipient} · {describeSource(entry)}
        </TimelineDescription>
        {failed && entry.failure_reason ? (
          <TimelineDescription
            className="text-red-600 dark:text-red-400 break-words"
            data-testid="admin-user-email-log-failure-reason"
          >
            {entry.failure_reason}
          </TimelineDescription>
        ) : null}
      </TimelineContent>
    </TimelineItem>
  );
}

/**
 * The verification and password reset e-mails sent to a user (newest
 * first), as recorded in USER_EMAIL_LOG, including the ones the mail
 * server did not accept.
 */
export function UserEmailLogCard({ uid }: UserEmailLogCardProps): ReactElement {
  const { data, error, isLoading } = useUserEmailLog(uid);

  let content: ReactElement;
  if (!data && isLoading) {
    content = (
      <div className="min-h-24 w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  } else if (error && !data) {
    content = (
      <div className="min-h-16 w-full flex items-center justify-center text-sm text-destructive">
        Failed to load the email log: {error.message}
      </div>
    );
  } else if (!data || data.length === 0) {
    content = (
      <p
        className="text-sm text-muted-foreground"
        data-testid="admin-user-email-log-empty"
      >
        No verification or password reset emails have been sent to this user.
      </p>
    );
  } else {
    content = (
      <Timeline data-testid="admin-user-email-log-timeline">
        {data.map((entry, index) => (
          <UserEmailLogTimelineItem
            key={entry.email_log_id}
            entry={entry}
            isLast={index === data.length - 1}
          />
        ))}
      </Timeline>
    );
  }

  return (
    <Card className="w-full" data-testid="admin-user-email-log-card">
      <CardHeader>
        <CardTitle>Email Log</CardTitle>
        <CardDescription>
          Verification and password reset emails sent to this user, newest
          first, including attempts the mail server did not accept.
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

export default UserEmailLogCard;
