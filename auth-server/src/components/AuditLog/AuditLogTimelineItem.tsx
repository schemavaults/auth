"use client";

import type { ReactElement } from "react";
import {
  Badge,
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
import {
  Ban,
  Building2,
  KeyRound,
  LogIn,
  LogOut,
  MailCheck,
  MailPlus,
  MailX,
  Plug,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Unplug,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { LocalDateTime } from "@schemavaults/auth-ui";
import type { AuditLogEntry } from "@/lib/audit-log/audit-log-entry-schema";
import {
  AUDIT_EVENT_LABELS,
  describeAuditEvent,
  isWarningAuditEvent,
} from "@/lib/audit-log/describe-audit-event";
import type { AuditEventType } from "@/lib/audit-log/event-types";

const AUDIT_EVENT_ICONS: Record<AuditEventType, LucideIcon> = {
  "user.registered": UserPlus,
  "user.signed_in": LogIn,
  "user.sign_in_failed": ShieldAlert,
  "user.mfa_challenge_failed": ShieldAlert,
  "user.signed_out": LogOut,
  "user.password_reset": KeyRound,
  "user.email_verified": MailCheck,
  "user.profile_updated": UserCog,
  "user.mfa_factor_added": ShieldCheck,
  "user.mfa_factor_removed": ShieldOff,
  "user.mfa_recovery_codes_regenerated": RefreshCw,
  "user.mfa_reset_by_admin": ShieldOff,
  "user.app_authorized": Plug,
  "user.app_authorization_revoked": Unplug,
  "user.app_scope_consent_revoked": Unplug,
  "user.disabled": Ban,
  "user.enabled": UserCheck,
  "user.promoted_to_admin": UserCog,
  "organization.created": Building2,
  "organization.deleted": Trash2,
  "organization.invitation_sent": MailPlus,
  "organization.invitation_revoked": MailX,
  "organization.invitation_accepted": MailCheck,
  "organization.invitation_declined": MailX,
  "organization.member_added": UserPlus,
  "organization.member_role_changed": UserCog,
  "organization.member_removed": UserMinus,
  "organization.mfa_requirement_enabled": ShieldCheck,
  "organization.mfa_requirement_updated": ShieldCheck,
  "organization.mfa_requirement_disabled": ShieldOff,
};

export interface AuditLogTimelineItemProps {
  entry: AuditLogEntry;
  isLast: boolean;
  /** The signed-in user reading the log: entries naming them say "You". */
  viewer_uid?: string;
  /** Show which organization an entry belongs to (the user's own log). */
  showOrganization: boolean;
}

export function AuditLogTimelineItem({
  entry,
  isLast,
  viewer_uid,
  showOrganization,
}: AuditLogTimelineItemProps): ReactElement {
  const warning: boolean = isWarningAuditEvent(entry.event_type);
  const Icon: LucideIcon = AUDIT_EVENT_ICONS[entry.event_type];

  return (
    <TimelineItem data-testid="audit-log-entry" data-event-type={entry.event_type}>
      {/*
        The indicator and connector are stretched explicitly: left at their
        content height the connector collapses to nothing. The indicator's
        negative bottom margin (the item's pb-6) carries the line down to
        the next item's dot.
      */}
      <TimelineIndicator className={isLast ? undefined : "self-stretch -mb-6"}>
        <TimelineDot variant={warning ? "destructive" : "primary"}>
          <Icon />
        </TimelineDot>
        {isLast ? null : <TimelineConnector className="self-stretch my-1" />}
      </TimelineIndicator>
      <TimelineContent>
        <TimelineHeader>
          <TimelineTitle className="flex flex-wrap items-center gap-2">
            {AUDIT_EVENT_LABELS[entry.event_type]}
            {showOrganization && entry.organization_id ? (
              <Badge variant="secondary" data-testid="audit-log-entry-organization">
                {entry.organization_id}
              </Badge>
            ) : null}
          </TimelineTitle>
          <TimelineTime dateTime={new Date(entry.created_at).toISOString()}>
            <LocalDateTime value={entry.created_at} />
          </TimelineTime>
        </TimelineHeader>
        <TimelineDescription className="break-words" data-testid="audit-log-entry-description">
          {describeAuditEvent(entry, viewer_uid)}
        </TimelineDescription>
        {entry.ip_address || entry.user_agent ? (
          <TimelineDescription
            className="break-words text-xs"
            data-testid="audit-log-entry-request"
          >
            {[entry.ip_address ? `From ${entry.ip_address}` : null, entry.user_agent]
              .filter((part): part is string => !!part)
              .join(" · ")}
          </TimelineDescription>
        ) : null}
      </TimelineContent>
    </TimelineItem>
  );
}

export default AuditLogTimelineItem;
