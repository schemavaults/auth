"use client";

import { useEffect, useState, type ReactElement } from "react";
import {
  AgentSessions,
  AgentSessionsComposer,
  AgentSessionsConversation,
  AgentSessionsHeader,
  AgentSessionsList,
  AgentSessionsListItem,
  AgentSessionsMain,
  AgentSessionsNewSessionButton,
  AgentSessionsPromptInput,
  AgentSessionsSearch,
  AgentSessionsSidebar,
  AgentSessionsSidebarContent,
  AgentSessionsSidebarFooter,
  AgentSessionsSidebarHeader,
  AgentSessionsSidebarToggle,
  AgentSessionsTitle,
  Button,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
} from "@schemavaults/ui";
import type { AgentScopeOption } from "@/lib/agents/scopes";
import type { AgentSessionView, AgentTranscriptEntry } from "@/lib/agents/runtime/types";
import {
  endAgentSessionAction,
  grantAgentAccessAgainAction,
  revokeAgentAccessAction,
  sendAgentMessageAction,
  signOutOfAgentsAction,
  startAgentSessionAction,
  type AgentActionResult,
} from "./actions";
import { AgentSessionActions } from "./agent-session-actions";
import { AgentTranscript } from "./agent-transcript";
import { NewAgentSession } from "./new-agent-session";

export interface AgentWorkspaceProps {
  email: string | null;
  /** The scopes the user granted the app at sign-in. */
  grantedScopes: string[];
  scopeOptions: readonly AgentScopeOption[];
  initialSessions: AgentSessionView[];
}

/** The agent sessions page for a signed-in user, built on `<AgentSessions>` from @schemavaults/ui. */
export function AgentWorkspace({
  email,
  grantedScopes,
  scopeOptions,
  initialSessions,
}: AgentWorkspaceProps): ReactElement {
  const [sessions, setSessions] = useState<AgentSessionView[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  /** The session an action is running for (`new` for the new-session screen), and its prompt. */
  const [pending, setPending] = useState<{ sessionId: string; prompt: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(() =>
    scopeOptions.map((option) => option.scope).filter((scope) => grantedScopes.includes(scope)),
  );
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function run(
    sessionId: string,
    prompt: string | null,
    action: () => Promise<AgentActionResult>,
  ): Promise<void> {
    setPending({ sessionId, prompt });
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        if (result.signedOut) window.location.assign("/agents");
        return;
      }
      setSessions(result.sessions);
      setActiveSessionId(result.session.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const busy = pending !== null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="agent-workspace" data-ready={ready}>
      <AgentSessions<AgentSessionView>
        sessions={sessions}
        activeSessionId={activeSessionId}
        onActiveSessionIdChange={setActiveSessionId}
        newSessionTitle="New agent session"
        className="min-h-0 flex-1"
      >
        <AgentSessionsSidebar>
          <AgentSessionsSidebarHeader>
            <AgentSessionsNewSessionButton data-testid="new-agent-session" />
            <AgentSessionsSearch />
          </AgentSessionsSidebarHeader>
          <AgentSessionsSidebarContent>
            <AgentSessionsList<AgentSessionView>
              empty="No agent sessions yet."
              renderItem={(session) => (
                <AgentSessionsListItem
                  session={session}
                  data-testid="agent-session-item"
                  data-session-id={session.id}
                  data-status={session.status}
                />
              )}
            />
          </AgentSessionsSidebarContent>
          <AgentSessionsSidebarFooter className="flex flex-col gap-2 text-sm">
            <span className="truncate" data-testid="agents-signed-in-email">
              {email ?? "Signed in"}
            </span>
            <form action={signOutOfAgentsAction}>
              <Button type="submit" size="sm" variant="outline" className="w-full" data-testid="agents-sign-out">
                Sign out
              </Button>
            </form>
          </AgentSessionsSidebarFooter>
        </AgentSessionsSidebar>

        <AgentSessionsMain>
          <AgentSessionsHeader>
            <AgentSessionsSidebarToggle />
            <AgentSessionsTitle />
            {activeSession ? (
              <AgentSessionActions
                session={activeSession}
                pending={busy}
                onRevoke={() => run(activeSession.id, null, () => revokeAgentAccessAction(activeSession.id))}
                onGrantAgain={() =>
                  run(activeSession.id, null, () => grantAgentAccessAgainAction(activeSession.id))
                }
                onEnd={() => run(activeSession.id, null, () => endAgentSessionAction(activeSession.id))}
              />
            ) : null}
          </AgentSessionsHeader>

          <NewAgentSession
            scopeOptions={scopeOptions}
            grantedScopes={grantedScopes}
            selectedScopes={selectedScopes}
            onSelectedScopesChange={setSelectedScopes}
            pending={pending?.sessionId === "new"}
            onStart={(prompt) =>
              run("new", prompt, () => startAgentSessionAction({ scopes: selectedScopes, prompt }))
            }
          />

          <AgentSessionsConversation<AgentSessionView>>
            {({ session }) => {
              if (!session) return null;
              const working = pending?.sessionId === session.id && pending.prompt !== null;
              const entries: AgentTranscriptEntry[] = working
                ? [
                    ...session.transcript,
                    { id: "pending-prompt", kind: "user", text: pending.prompt ?? "", at: Date.now() },
                  ]
                : session.transcript;
              return (
                <div className="flex min-h-0 flex-1 flex-col" data-testid="agent-conversation" data-session-id={session.id}>
                  <AgentTranscript entries={entries} working={working} />
                  <AgentSessionsComposer>
                    {error ? (
                      <p className="pb-2 text-sm text-destructive" data-testid="agent-error">
                        {error}
                      </p>
                    ) : null}
                    <AgentSessionsPromptInput<AgentSessionView>
                      isLoading={working}
                      disabled={session.ended || busy}
                      onSubmit={(prompt) =>
                        run(session.id, prompt, () => sendAgentMessageAction(session.id, prompt))
                      }
                    >
                      <PromptInputTextarea
                        placeholder={session.ended ? "This session has ended." : "Ask the agent…"}
                        data-testid="agent-prompt"
                      />
                      <PromptInputToolbar>
                        <PromptInputSubmit data-testid="agent-prompt-submit" />
                      </PromptInputToolbar>
                    </AgentSessionsPromptInput>
                  </AgentSessionsComposer>
                </div>
              );
            }}
          </AgentSessionsConversation>
          {activeSession === undefined && error ? (
            <p className="px-4 pb-4 text-sm text-destructive" data-testid="agent-error">
              {error}
            </p>
          ) : null}
        </AgentSessionsMain>
      </AgentSessions>
    </div>
  );
}
