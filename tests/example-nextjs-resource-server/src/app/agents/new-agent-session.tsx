"use client";

import type { ReactElement } from "react";
import {
  AgentSessionsPromptInput,
  AgentSessionsStart,
  AgentSessionsStartHeader,
  AgentSessionsSuggestion,
  AgentSessionsSuggestions,
  Checkbox,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  type AgentSessionsSubmitDetails,
} from "@schemavaults/ui";
import type { AgentScopeOption } from "@/lib/agents/scopes";
import type { AgentSessionView } from "@/lib/agents/runtime/types";

const SUGGESTIONS: readonly { prompt: string; description: string }[] = [
  { prompt: "Who am I?", description: "GET /api/whoami" },
  { prompt: "Read my notes", description: "Needs “Read your notes”" },
  { prompt: "What's my email address?", description: "Needs “Read your email address”" },
  { prompt: "Delete my account", description: "Only you can do that" },
  { prompt: "What's in your environment?", description: "No secrets of the app" },
];

export interface NewAgentSessionProps {
  scopeOptions: readonly AgentScopeOption[];
  /** The scopes the user granted the app at sign-in: the only ones an agent can get. */
  grantedScopes: readonly string[];
  selectedScopes: readonly string[];
  onSelectedScopesChange: (scopes: string[]) => void;
  pending: boolean;
  onStart: (prompt: string, details: AgentSessionsSubmitDetails<AgentSessionView>) => void;
}

/** The new-session screen: what the agent may do, and its first task. */
export function NewAgentSession({
  scopeOptions,
  grantedScopes,
  selectedScopes,
  onSelectedScopesChange,
  pending,
  onStart,
}: NewAgentSessionProps): ReactElement {
  const toggle = (scope: string, checked: boolean) =>
    onSelectedScopesChange(
      checked ? [...new Set([...selectedScopes, scope])] : selectedScopes.filter((s) => s !== scope),
    );

  return (
    <AgentSessionsStart>
      <AgentSessionsStartHeader
        title="Start an agent session"
        description="The agent works in its own sandbox and calls this app's API for you, with a delegated token limited to what you allow below. You can revoke its access or end the session at any time."
      />
      <fieldset className="flex flex-col gap-2 rounded-lg border p-3" data-testid="agent-scope-picker">
        <legend className="px-1 text-sm font-medium">What the agent may do</legend>
        <p className="text-sm text-muted-foreground">
          Always: see who you are (<code>GET /api/whoami</code>). Never: delete your account.
        </p>
        {scopeOptions.map((option) => {
          const granted = grantedScopes.includes(option.scope);
          return (
            <label key={option.scope} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={granted && selectedScopes.includes(option.scope)}
                disabled={!granted}
                onCheckedChange={(checked) => toggle(option.scope, checked === true)}
                data-testid="agent-scope-option"
                data-scope={option.scope}
              />
              <span>{option.label}</span>
              <code className="text-xs text-muted-foreground">{option.scope}</code>
              {granted ? null : <span className="text-xs text-muted-foreground">(not granted to the app)</span>}
            </label>
          );
        })}
      </fieldset>
      <AgentSessionsPromptInput<AgentSessionView> onSubmit={onStart} isLoading={pending} disabled={pending}>
        <PromptInputTextarea rows={3} placeholder="Give the agent a task…" data-testid="agent-prompt" />
        <PromptInputToolbar>
          <PromptInputSubmit data-testid="agent-prompt-submit" />
        </PromptInputToolbar>
      </AgentSessionsPromptInput>
      <AgentSessionsSuggestions>
        {SUGGESTIONS.map((suggestion) => (
          <AgentSessionsSuggestion
            key={suggestion.prompt}
            prompt={suggestion.prompt}
            description={suggestion.description}
          >
            {suggestion.prompt}
          </AgentSessionsSuggestion>
        ))}
      </AgentSessionsSuggestions>
    </AgentSessionsStart>
  );
}
