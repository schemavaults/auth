import type { ReactElement } from "react";
import { Badge, cn } from "@schemavaults/ui";
import type { ApiDocsModel } from "@/model/types";

export interface ApiDocsHeaderProps {
  model: Pick<ApiDocsModel, "title" | "version" | "description" | "servers" | "openapiVersion">;
  /** URL of the raw OpenAPI document, if served. */
  openApiDocumentHref?: string;
  className?: string;
}

export function ApiDocsHeader({ model, openApiDocumentHref, className }: ApiDocsHeaderProps): ReactElement {
  return (
    <header className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{model.title}</h1>
        {model.version ? <Badge variant="secondary" className="font-mono font-normal">v{model.version}</Badge> : null}
        <Badge variant="outline" className="font-normal">OpenAPI {model.openapiVersion}</Badge>
      </div>
      {model.description ? <p className="max-w-prose text-sm text-muted-foreground">{model.description}</p> : null}
      {model.servers.length > 0 || openApiDocumentHref ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          {model.servers.map((server) => (
            <div key={server.url} className="flex items-center gap-1">
              <dt className="font-medium">Server</dt>
              <dd className="font-mono">{server.url}</dd>
              {server.description ? <dd>({server.description})</dd> : null}
            </div>
          ))}
          {openApiDocumentHref ? (
            <div className="flex items-center gap-1">
              <dt className="font-medium">Spec</dt>
              <dd>
                <a href={openApiDocumentHref} className="font-mono underline-offset-4 hover:underline">
                  {openApiDocumentHref}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </header>
  );
}

export default ApiDocsHeader;
