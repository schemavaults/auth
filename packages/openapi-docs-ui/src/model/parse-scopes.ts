import type { ApiDocsOperation, ApiDocsScope } from "./types";

type Json = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `x-schemavaults-scopes`: `[{ scope, description? }]` (malformed entries skipped). */
function fromScopesExtension(document: Json): [string, string | undefined][] {
  const extension = document["x-schemavaults-scopes"];
  if (!Array.isArray(extension)) return [];
  return extension.flatMap((entry): [string, string | undefined][] => {
    if (!isRecord(entry) || typeof entry.scope !== "string" || entry.scope.length === 0) return [];
    return [[entry.scope, typeof entry.description === "string" ? entry.description : undefined]];
  });
}

/** The `scopes` maps of every `oauth2` scheme's flows (`{ [scope]: description }`). */
function fromOAuth2Flows(document: Json): [string, string | undefined][] {
  const components = isRecord(document.components) ? document.components : {};
  const schemes = isRecord(components.securitySchemes) ? components.securitySchemes : {};
  return Object.values(schemes).flatMap((scheme): [string, string | undefined][] => {
    if (!isRecord(scheme) || !isRecord(scheme.flows)) return [];
    return Object.values(scheme.flows).flatMap((flow): [string, string | undefined][] =>
      isRecord(flow) && isRecord(flow.scopes)
        ? Object.entries(flow.scopes).map(([scope, description]) => [
            scope,
            typeof description === "string" ? description : undefined,
          ])
        : [],
    );
  });
}

/**
 * The API's scopes: those `x-schemavaults-scopes` lists, then those of
 * `oauth2` flows, then any other scope an operation requires. A scope's
 * description is the first non-empty one found; `requiredBy` lists the
 * operations requiring it.
 */
export function parseScopes(
  document: Json,
  operations: readonly ApiDocsOperation[],
): ApiDocsScope[] {
  const descriptions = new Map<string, string | undefined>();
  const add = ([scope, description]: [string, string | undefined]): void => {
    const known = descriptions.get(scope);
    const usable = description !== undefined && description.trim().length > 0 ? description : undefined;
    if (!descriptions.has(scope) || (known === undefined && usable !== undefined)) {
      descriptions.set(scope, usable);
    }
  };
  fromScopesExtension(document).forEach(add);
  fromOAuth2Flows(document).forEach(add);
  for (const operation of operations) {
    for (const scope of operation.auth.requiredScopes) add([scope, undefined]);
  }
  return [...descriptions.entries()].map(([scope, description]) => ({
    scope,
    ...(description !== undefined ? { description } : {}),
    requiredBy: operations
      .filter((operation) => operation.auth.requiredScopes.includes(scope))
      .map((operation) => operation.slug),
  }));
}
