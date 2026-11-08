import type { ReactElement, ReactNode } from "react";

export interface DemoGroupProps {
  /** Section heading, e.g. "Public client". */
  title: string;
  /** One line on what the demos in this group have in common. */
  description: ReactNode;
  /**
   * The client app the group's demos sign in as: the environment variable
   * naming it and its value (null when this deployment does not set it).
   */
  clientApp?: { envVar: string; appId: string | null };
  /** `data-testid` of the section (`demo-group-<id>`). */
  id: string;
  children: ReactNode;
}

/** A home page section: the demos that sign in as the same client app. */
export function DemoGroup({ title, description, clientApp, id, children }: DemoGroupProps): ReactElement {
  const headingId = `demo-group-${id}-heading`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4" data-testid={`demo-group-${id}`}>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        {clientApp ? (
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            <code className="font-mono">{clientApp.envVar}</code>
            {": "}
            {clientApp.appId ? (
              <code className="font-mono text-foreground" data-testid={`demo-group-${id}-app-id`}>
                {clientApp.appId}
              </code>
            ) : (
              <span data-testid={`demo-group-${id}-app-id-missing`}>not set on this deployment</span>
            )}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export default DemoGroup;
