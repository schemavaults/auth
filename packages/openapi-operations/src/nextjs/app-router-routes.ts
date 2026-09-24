/**
 * Consistency check between an operations catalogue and the Next.js App
 * Router files serving it, for the "one `route.ts` per operation" layout
 * (see `createOperationsAppFactory()`):
 *
 * - every `operation.ts` / `operations.ts` under the API directory exports
 *   at least one operation, has a sibling `route.ts`, and each exported
 *   operation is in the catalogue and declares the path its directory
 *   serves (`app/api/items/[id]` ↔ `/api/items/{id}`, route groups
 *   `(group)` ignored, catch-all segments rejected);
 * - every catalogue entry comes from such a file;
 * - every `route.ts` under the API directory serves a catalogued path (or
 *   one listed in `ignoredRoutePaths`, e.g. the `openapi.json` route).
 *
 * Runs under `bun test` / a `bun` script (it reads the file system and
 * imports the operation modules), not inside a request handler.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { AnyOperationDefinition } from "../operation";
import { assertUniqueOperations } from "../operation";

export interface CheckNextAppRouterRoutesOptions {
  /** The catalogue `buildOpenApiDocument()` / the app factory are given. */
  readonly operations: readonly AnyOperationDefinition[];
  /** The Next.js `app` directory (absolute, or relative to the working directory), e.g. `src/app`. */
  readonly appDirectory: string;
  /** Sub-directory of `appDirectory` holding the API route files. Default `api`. */
  readonly apiDirectory?: string;
  /**
   * File names (beside a `route.ts`) that declare the operations the route
   * serves. Default `["operation.ts", "operations.ts"]`.
   */
  readonly operationFileNames?: readonly string[];
  /** Default `route.ts`. */
  readonly routeFileName?: string;
  /**
   * OpenAPI paths served by route files that are not operations (the route
   * serving the OpenAPI document itself, a webhook with its own handler,
   * ...). Such a route file needs no operation file.
   */
  readonly ignoredRoutePaths?: readonly string[];
  /**
   * Directories (relative to `appDirectory`, `/`-separated, e.g.
   * `api/auth/[...nextauth]`) whose route files are not checked at all.
   */
  readonly ignoredRouteDirectories?: readonly string[];
  /** Loads an operation module; default `import(fileUrl)`. */
  readonly importModule?: (file: string) => Promise<Record<string, unknown>>;
  /** How the catalogue is named in messages. Default `the operations catalogue`. */
  readonly catalogueLabel?: string;
}

export interface NextAppRouterRoutesReport {
  readonly ok: boolean;
  /** Human readable problems; empty when `ok`. */
  readonly problems: readonly string[];
  /** Operation files that were checked (absolute paths). */
  readonly operationFiles: readonly string[];
  /** Route files that were checked (absolute paths). */
  readonly routeFiles: readonly string[];
}

const DEFAULT_OPERATION_FILE_NAMES = ["operation.ts", "operations.ts"] as const;
const DEFAULT_ROUTE_FILE_NAME = "route.ts";

/**
 * Route directory (relative to the app directory) → OpenAPI path:
 * `(group)` segments dropped, `[param]` → `{param}`. Returns null for
 * catch-all segments (`[...slug]`, `[[...slug]]`), which OpenAPI cannot
 * describe.
 */
export function nextRouteDirectoryToOpenApiPath(routeDirectory: string): string | null {
  const out: string[] = [];
  for (const segment of routeDirectory.split(/[\\/]/).filter((part) => part.length > 0)) {
    if (segment.startsWith("(") && segment.endsWith(")")) continue;
    if (segment.startsWith("[...") || segment.startsWith("[[...")) return null;
    const param = /^\[([^\]]+)\]$/.exec(segment);
    out.push(param ? `{${param[1]}}` : segment);
  }
  return `/${out.join("/")}`;
}

/** OpenAPI path → route directory relative to the app directory: `/api/items/{id}` → `api/items/[id]`. */
export function openApiPathToNextRouteDirectory(openApiPath: string): string {
  return openApiPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/^\{([^}]+)\}$/, "[$1]"))
    .join("/");
}

function isOperationDefinition(value: unknown): value is AnyOperationDefinition {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AnyOperationDefinition>;
  return (
    typeof candidate.method === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.operationId === "string" &&
    typeof candidate.handler === "function"
  );
}

function findFiles(directory: string, names: ReadonlySet<string>): string[] {
  if (!existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    // `_private` folders and node_modules are never routes.
    if (entry.name.startsWith("_") || entry.name === "node_modules") continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...findFiles(full, names));
    else if (names.has(entry.name)) found.push(full);
  }
  return found.sort();
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

async function defaultImportModule(file: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
}

/**
 * Checks the route files against the catalogue and reports every problem
 * found (never throws for layout problems; see {@link assertNextAppRouterRoutes}).
 */
export async function checkNextAppRouterRoutes(
  options: CheckNextAppRouterRoutesOptions,
): Promise<NextAppRouterRoutesReport> {
  const appDirectory = resolve(options.appDirectory);
  const apiDirectory = join(appDirectory, options.apiDirectory ?? "api");
  const operationFileNames = new Set(options.operationFileNames ?? DEFAULT_OPERATION_FILE_NAMES);
  const routeFileName = options.routeFileName ?? DEFAULT_ROUTE_FILE_NAME;
  const ignoredRoutePaths = new Set(options.ignoredRoutePaths ?? []);
  const ignoredRouteDirectories = new Set(
    (options.ignoredRouteDirectories ?? []).map((directory) => toPosix(directory).replace(/^\/+|\/+$/g, "")),
  );
  const importModule = options.importModule ?? defaultImportModule;
  const catalogueLabel = options.catalogueLabel ?? "the operations catalogue";
  const cwd = process.cwd();
  const label = (file: string): string => toPosix(relative(cwd, file));
  const routeDirectoryOf = (file: string): string => toPosix(relative(appDirectory, dirname(file)));
  const isIgnoredDirectory = (file: string): boolean => ignoredRouteDirectories.has(routeDirectoryOf(file));

  const problems: string[] = [];

  try {
    assertUniqueOperations(options.operations);
  } catch (error: unknown) {
    problems.push(`${catalogueLabel}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const catalogued = new Set<AnyOperationDefinition>(options.operations);
  const cataloguedById = new Map(options.operations.map((operation) => [operation.operationId, operation]));
  const cataloguedPaths = new Set(options.operations.map((operation) => operation.path));

  if (!existsSync(apiDirectory)) {
    problems.push(`API directory ${label(apiDirectory)} does not exist`);
  }

  const operationFiles = findFiles(apiDirectory, operationFileNames).filter((file) => !isIgnoredDirectory(file));
  const routeFiles = findFiles(apiDirectory, new Set([routeFileName])).filter((file) => !isIgnoredDirectory(file));
  const discovered = new Set<AnyOperationDefinition>();

  for (const file of operationFiles) {
    const directory = dirname(file);
    const fileLabel = label(file);

    if (!existsSync(join(directory, routeFileName))) {
      problems.push(`${fileLabel}: no sibling ${routeFileName} serves these operations`);
    }

    const expectedPath = nextRouteDirectoryToOpenApiPath(routeDirectoryOf(file));
    if (expectedPath === null) {
      problems.push(
        `${fileLabel}: catch-all segments cannot be described in OpenAPI; use explicit [param] segments`,
      );
      continue;
    }

    let mod: Record<string, unknown>;
    try {
      mod = await importModule(file);
    } catch (error: unknown) {
      problems.push(`${fileLabel}: failed to import (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    const exported = Object.entries(mod).filter((entry): entry is [string, AnyOperationDefinition] =>
      isOperationDefinition(entry[1]),
    );
    if (exported.length === 0) {
      problems.push(`${fileLabel}: exports no operations (export the result of defineOperation())`);
      continue;
    }

    for (const [exportName, operation] of exported) {
      const id = operation.operationId;
      if (operation.path !== expectedPath) {
        problems.push(
          `${fileLabel}: export '${exportName}' (${id}) declares path '${operation.path}' but its directory maps to '${expectedPath}'`,
        );
      }
      if (catalogued.has(operation)) {
        discovered.add(operation);
      } else if (cataloguedById.has(id)) {
        problems.push(
          `${fileLabel}: export '${exportName}' (${id}) is a different object from the '${id}' listed in ${catalogueLabel} (defined twice?)`,
        );
      } else {
        problems.push(`${fileLabel}: export '${exportName}' (${id}) is not listed in ${catalogueLabel}`);
      }
    }
  }

  for (const operation of catalogued) {
    if (!discovered.has(operation)) {
      const fileNames = [...operationFileNames].join(" / ");
      problems.push(
        `${catalogueLabel}: '${operation.operationId}' (${operation.method.toUpperCase()} ${operation.path}) is not exported by any ${fileNames} under ${label(apiDirectory)}; define operations next to the ${routeFileName} that serves them`,
      );
    }
  }

  for (const file of routeFiles) {
    const routePath = nextRouteDirectoryToOpenApiPath(routeDirectoryOf(file));
    if (routePath === null) {
      problems.push(
        `${label(file)}: catch-all route files cannot serve documented operations; list its directory in ignoredRouteDirectories if it is not one`,
      );
      continue;
    }
    if (cataloguedPaths.has(routePath) || ignoredRoutePaths.has(routePath)) continue;
    problems.push(
      `${label(file)}: serves '${routePath}', which is not in ${catalogueLabel} (add it to ignoredRoutePaths if it is not an operation)`,
    );
  }

  return { ok: problems.length === 0, problems, operationFiles, routeFiles };
}

/** {@link checkNextAppRouterRoutes} that throws an Error listing every problem. */
export async function assertNextAppRouterRoutes(
  options: CheckNextAppRouterRoutesOptions,
): Promise<NextAppRouterRoutesReport> {
  const report = await checkNextAppRouterRoutes(options);
  if (!report.ok) {
    throw new Error(
      `Next.js App Router route files and the operations catalogue disagree:\n${report.problems
        .map((problem) => `  - ${problem}`)
        .join("\n")}`,
    );
  }
  return report;
}
