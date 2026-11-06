"use client";

import { Fragment, type ReactElement, type ReactNode } from "react";
import {
  AgentChatAnnouncement,
  AgentChatBubble,
  AgentChatMessages,
  AgentTypingIndicator,
  TerminalFrame,
  TerminalFrameBody,
  TerminalFrameHeader,
  TerminalFrameOutput,
  TerminalFramePrompt,
  TerminalFrameTitle,
} from "@schemavaults/ui";
import { FAKE_AGENT_MODEL_NAME } from "@/lib/agents/model/fake-agent-model";
import type { AgentTranscriptEntry } from "@/lib/agents/runtime/types";

/** Renders `code` spans in the model's and events' text. */
function withInlineCode(text: string): ReactNode {
  return text.split(/(`[^`]+`)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
        {part.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

const EVENT_VARIANTS = {
  info: "info",
  warning: "warning",
  destructive: "destructive",
} as const satisfies Record<Extract<AgentTranscriptEntry, { kind: "event" }>["tone"], string>;

function TranscriptEntry({ entry }: { entry: AgentTranscriptEntry }): ReactElement {
  switch (entry.kind) {
    case "user":
      return (
        <AgentChatBubble from="user" data-testid="agent-message" data-role="user">
          {entry.text}
        </AgentChatBubble>
      );
    case "assistant":
      return (
        <AgentChatBubble
          from="assistant"
          senderName={FAKE_AGENT_MODEL_NAME}
          data-testid="agent-message"
          data-role="assistant"
        >
          {withInlineCode(entry.text)}
        </AgentChatBubble>
      );
    case "tool":
      return (
        <TerminalFrame
          size="sm"
          data-testid="agent-tool-call"
          data-tool={entry.tool}
          data-exit-code={entry.exitCode}
        >
          <TerminalFrameHeader>
            <TerminalFrameTitle>sandbox · exit {entry.exitCode}</TerminalFrameTitle>
          </TerminalFrameHeader>
          <TerminalFrameBody className="max-h-80 overflow-auto">
            <TerminalFramePrompt prompt="$">{entry.command}</TerminalFramePrompt>
            <TerminalFrameOutput
              tone={entry.exitCode === 0 ? "default" : "warning"}
              className="whitespace-pre-wrap break-all"
              data-testid="agent-tool-output"
            >
              {entry.output}
            </TerminalFrameOutput>
          </TerminalFrameBody>
        </TerminalFrame>
      );
    case "event":
      return (
        <AgentChatAnnouncement
          variant={EVENT_VARIANTS[entry.tone]}
          data-testid="agent-event"
          data-tone={entry.tone}
        >
          {withInlineCode(entry.text)}
        </AgentChatAnnouncement>
      );
  }
}

export interface AgentTranscriptProps {
  entries: readonly AgentTranscriptEntry[];
  /** Shows the typing indicator while the agent works. */
  working: boolean;
}

/** A session's transcript: the user's prompts, the model's replies, tool runs and session events. */
export function AgentTranscript({ entries, working }: AgentTranscriptProps): ReactElement {
  return (
    <AgentChatMessages className="min-h-0 flex-1" aria-label="Agent session transcript">
      {/* Keyed by position: transcripts only grow, so the optimistic prompt
          and the server's copy of it share a key and do not animate twice. */}
      {entries.map((entry, index) => (
        <TranscriptEntry key={`entry-${index}`} entry={entry} />
      ))}
      {working ? <AgentTypingIndicator key="typing" label="The agent is working" /> : null}
    </AgentChatMessages>
  );
}
