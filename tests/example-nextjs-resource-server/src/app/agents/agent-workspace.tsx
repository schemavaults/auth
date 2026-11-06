"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
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
import { AgentSessionError, BrowserAgentRuntime } from "@/lib/agents/browser/browser-agent-runtime";
import type { AgentScopeOption } from "@/lib/agents/scopes";
import type { AgentSessionView, AgentTranscriptEntry } from "@/lib/agents/runtime/types";
import {
  mintDelegatedTokenAction,
  revokeDelegatedTokenAction,
  signOutOfAgentsAction,
  type AgentServerResult,
} from "./actions";
import { AgentSessionActions } from "./agent-session-actions";
import { AgentTranscript } from "./agent-transcript";
import { NewAgentSession } from "./new-agent-session";

export interface AgentWorkspaceProps {
  /** OIDC `sub` of the signed-in user: whose sessions (kept in this browser) to show. */
  ownerSub: string;
  email: string | null;
  /** The scopes the user granted the app at sign-in. */
  grantedScopes: string[];
  scopeOptions: readonly AgentScopeOption[];
}

/** A Server Function's answer, or its error thrown; signed out, the page reloads to offer signing in. */
function unwrap<T extends object>(result: AgentServerResult<T>): T {
  if (result.ok) return result;
  if (result.signedOut) window.location.assign("/agents");
  throw new AgentSessionError(result.error);
}

/**
 * The user's agents, run in this browser: sessions, transcripts and
 * sandboxes in `localStorage`, delegated tokens minted and revoked by the
 * app's server (actions.ts), which keeps the client secret.
 */
function createRuntime(ownerSub: string): BrowserAgentRuntime {
  return new BrowserAgentRuntime({
    ownerSub,
    storage: window.localStorage,
    apiBaseUrl: window.location.origin,
    mintDelegatedToken: async (scopes) => unwrap(await mintDelegatedTokenAction([...scopes])).grant,
    revokeDelegatedToken: async (token) => {
      unwrap(await revokeDelegatedTokenAction(token));
    },
  });
}

/** The agent sessions page for a signed-in user, built on `<AgentSessions>` from @schemavaults/ui. */
export function AgentWorkspace({ ownerSub, email, grantedScopes, scopeOptions }: AgentWorkspaceProps): ReactElement {
  const runtime = useRef<BrowserAgentRuntime | null>(null);
  const [sessions, setSessions] = useState<AgentSessionView[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  /** The session an action is running for (`new` for the new-session screen), and its prompt. */
  const [pending, setPending] = useState<{ sessionId: string; prompt: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(() =>
    scopeOptions.map((option) => option.scope).filter((scope) => grantedScopes.includes(scope)),
  );
  const [ready, setReady] = useState(false);

  // The runtime needs the browser's storage: made after hydration.
  useEffect(() => {
    try {
      runtime.current = createRuntime(ownerSub);
      setSessions(runtime.current.list());
      setReady(true);
    } catch (e: unknown) {
      setError(`Agent sessions need this browser's local storage: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [ownerSub]);

  async function run(
    sessionId: string,
    prompt: string | null,
    action: (runtime: BrowserAgentRuntime) => Promise<AgentSessionView>,
  ): Promise<void> {
    const current = runtime.current;
    if (!current) return;
    setPending({ sessionId, prompt });
    setError(null);
    try {
      const session = await action(current);
      setActiveSessionId(session.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSessions(current.list());
      setPending(null);
    }
  }

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const busy = pending !== null || !ready;

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
                onRevoke={() => run(activeSession.id, null, (agents) => agents.revoke(activeSession.id))}
                onGrantAgain={() => run(activeSession.id, null, (agents) => agents.grantAgain(activeSession.id))}
                onEnd={() => run(activeSession.id, null, (agents) => agents.end(activeSession.id))}
              />
            ) : null}
          </AgentSessionsHeader>

          <NewAgentSession
            scopeOptions={scopeOptions}
            grantedScopes={grantedScopes}
            selectedScopes={selectedScopes}
            onSelectedScopesChange={setSelectedScopes}
            pending={pending?.sessionId === "new" || !ready}
            onStart={(prompt) => run("new", prompt, (agents) => agents.start(selectedScopes, prompt))}
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
                      onSubmit={(prompt) => run(session.id, prompt, (agents) => agents.send(session.id, prompt))}
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
