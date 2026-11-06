"use client";

import type { ReactElement } from "react";
import { AgentSessionsHeaderActions, Badge, Button } from "@schemavaults/ui";
import type { AgentCredentialStatus, AgentSessionView } from "@/lib/agents/runtime/types";

const STATUS_LABELS: Record<AgentCredentialStatus, string> = {
  active: "Access granted",
  revoked: "Access revoked",
  rejected: "Access ended",
  expired: "Access expired",
};

export interface AgentSessionActionsProps {
  session: AgentSessionView;
  pending: boolean;
  onRevoke: () => void;
  onGrantAgain: () => void;
  onEnd: () => void;
}

/** The active session's access (status and scope) and what the user can do about it. */
export function AgentSessionActions({
  session,
  pending,
  onRevoke,
  onGrantAgain,
  onEnd,
}: AgentSessionActionsProps): ReactElement {
  const status = session.credentialStatus;
  return (
    <AgentSessionsHeaderActions>
      {status ? (
        <Badge
          variant={status === "active" && !session.ended ? "secondary" : "outline"}
          data-testid="agent-credential-status"
          data-status={session.ended ? "ended" : status}
          title={session.scope ? `Scope: ${session.scope}` : undefined}
        >
          {session.ended ? "Session ended" : STATUS_LABELS[status]}
        </Badge>
      ) : null}
      {session.scope !== null ? (
        <code className="hidden text-xs text-muted-foreground md:inline" data-testid="agent-session-scope">
          {session.scope}
        </code>
      ) : null}
      {session.ended || !session.sandboxId ? null : status === "active" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={onRevoke} data-testid="revoke-agent-access">
          Revoke access
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={onGrantAgain} data-testid="grant-agent-access">
          Grant access again
        </Button>
      )}
      {session.ended ? null : (
        <Button size="sm" variant="destructive" disabled={pending} onClick={onEnd} data-testid="end-agent-session">
          End session
        </Button>
      )}
    </AgentSessionsHeaderActions>
  );
}
