"use client";

import type { ReactElement } from "react";

export interface DocsTextProps {
  /** A description from the OpenAPI document. */
  text: string;
}

/**
 * Renders OpenAPI description text with its CommonMark code spans
 * (`` `name` ``) as inline `<code>`; everything else stays plain text.
 */
export function DocsText({ text }: DocsTextProps): ReactElement {
  // With a capture group, split() puts the code spans at the odd indexes.
  const parts = text.split(/`([^`\n]+)`/g);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default DocsText;
