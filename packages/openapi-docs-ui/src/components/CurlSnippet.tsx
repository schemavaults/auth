import type { ReactElement } from "react";
import { CodeBlock } from "@schemavaults/ui";
import type { ApiDocsModel, ApiDocsOperation, ApiDocsSecurityScheme } from "@/model/types";
import { exampleFromSchema } from "@/model/schema-utils";

export interface CurlSnippetProps {
  operation: ApiDocsOperation;
  model: Pick<ApiDocsModel, "servers" | "schemas" | "securitySchemes">;
  /** Overrides the first documented server URL. */
  baseUrl?: string;
  className?: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function authHeaderFor(scheme: ApiDocsSecurityScheme | undefined): string[] {
  if (!scheme) return [];
  if (scheme.type === "http" && scheme.scheme === "bearer") {
    return [`-H ${shellQuote("Authorization: Bearer <access_token>")}`];
  }
  if (scheme.type === "http" && scheme.scheme === "basic") {
    return [`-u ${shellQuote("<client_id>:<client_secret>")}`];
  }
  if (scheme.type === "apiKey" && scheme.in === "header") {
    return [`-H ${shellQuote(`${scheme.parameterName ?? "X-Api-Key"}: <value>`)}`];
  }
  if (scheme.type === "apiKey" && scheme.in === "cookie") {
    return [`-b ${shellQuote(`${scheme.parameterName ?? "session"}=<value>`)}`];
  }
  return [];
}

/** Builds an illustrative curl command for an operation. */
export function buildCurlCommand(
  operation: ApiDocsOperation,
  model: Pick<ApiDocsModel, "servers" | "schemas" | "securitySchemes">,
  baseUrl?: string,
): string {
  const server = (baseUrl ?? model.servers[0]?.url ?? "https://api.example.com").replace(/\/+$/, "");
  let path = operation.path;
  for (const parameter of operation.parameters) {
    if (parameter.in === "path") {
      path = path.replace(`{${parameter.name}}`, `<${parameter.name}>`);
    }
  }
  const query = operation.parameters
    .filter((parameter) => parameter.in === "query" && parameter.required)
    .map((parameter) => `${parameter.name}=<${parameter.name}>`);
  const url = `${server}${path}${query.length > 0 ? `?${query.join("&")}` : ""}`;

  const lines: string[] = [`curl -X ${operation.method} ${shellQuote(url)}`];
  const firstScheme = operation.auth.public
    ? undefined
    : model.securitySchemes.find((scheme) => scheme.name === operation.auth.schemeNames[0]);
  lines.push(...authHeaderFor(firstScheme));
  for (const parameter of operation.parameters) {
    if (parameter.in === "header" && parameter.required) {
      lines.push(`-H ${shellQuote(`${parameter.name}: <${parameter.name}>`)}`);
    }
  }
  const body = operation.requestBody?.content[0];
  if (body) {
    lines.push(`-H ${shellQuote(`Content-Type: ${body.contentType}`)}`);
    const example = body.example ?? exampleFromSchema(body.schema, model.schemas);
    if (body.contentType.includes("json")) {
      lines.push(`-d ${shellQuote(JSON.stringify(example ?? {}, null, 2))}`);
    } else if (body.contentType === "application/x-www-form-urlencoded" && example && typeof example === "object") {
      for (const [key, value] of Object.entries(example as Record<string, unknown>)) {
        lines.push(`--data-urlencode ${shellQuote(`${key}=${String(value)}`)}`);
      }
    }
  }
  return lines.join(" \\\n  ");
}

export function CurlSnippet({ operation, model, baseUrl, className }: CurlSnippetProps): ReactElement {
  return (
    <CodeBlock
      value={buildCurlCommand(operation, model, baseUrl)}
      language="bash"
      title="curl"
      size="sm"
      variant="terminal"
      wrap
      className={className}
    />
  );
}

export default CurlSnippet;
