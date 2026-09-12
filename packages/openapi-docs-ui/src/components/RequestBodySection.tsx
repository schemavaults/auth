import type { ReactElement } from "react";
import { Badge, JsonViewer, type JsonValue } from "@schemavaults/ui";
import type { ApiDocsMediaType, ApiDocsModel, ApiDocsRequestBody } from "@/model/types";
import { exampleFromSchema } from "@/model/schema-utils";
import { SchemaViewer } from "./SchemaViewer";

export interface MediaTypeSectionProps {
  mediaType: ApiDocsMediaType;
  schemas: ApiDocsModel["schemas"];
  /** Show a generated example next to the schema (default true). */
  showExample?: boolean;
}

function toJsonValue(value: unknown): JsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
  } catch {
    return null;
  }
}

export function MediaTypeSection({ mediaType, schemas, showExample = true }: MediaTypeSectionProps): ReactElement {
  const example = mediaType.example ?? (showExample ? exampleFromSchema(mediaType.schema, schemas) : undefined);
  const exampleIsRenderable =
    showExample && example !== undefined && mediaType.contentType.toLowerCase().includes("json");
  return (
    <div className="flex flex-col gap-3">
      <Badge variant="outline" className="w-fit font-mono font-normal">
        {mediaType.contentType}
      </Badge>
      <SchemaViewer schema={mediaType.schema} schemas={schemas} />
      {exampleIsRenderable ? (
        <JsonViewer
          value={toJsonValue(example)}
          title="Example"
          size="sm"
          defaultExpandLevel={3}
          showItemCount={false}
        />
      ) : null}
    </div>
  );
}

export interface RequestBodySectionProps {
  requestBody: ApiDocsRequestBody;
  schemas: ApiDocsModel["schemas"];
  showExample?: boolean;
}

export function RequestBodySection({ requestBody, schemas, showExample }: RequestBodySectionProps): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {requestBody.required ? "Required" : "Optional"}
        {requestBody.description ? ` — ${requestBody.description}` : ""}
      </p>
      {requestBody.content.map((mediaType) => (
        <MediaTypeSection
          key={mediaType.contentType}
          mediaType={mediaType}
          schemas={schemas}
          showExample={showExample}
        />
      ))}
    </div>
  );
}

export default RequestBodySection;
