import type { z, ZodObject, ZodType } from "zod";
import type { OrganizationMembershipRoleType } from "@schemavaults/auth-common/organizations";
import { type HttpMethod, HTTP_METHODS_WITH_REQUEST_BODY, isHttpMethod } from "./http-method";
import type { OperationAuth, PublicOperationAuth } from "./auth-scheme";
import { extractPathParameterNames, isOpenApiPath } from "./openapi/path-format";

// ---------------------------------------------------------------------------
// Request / response shape declarations
// ---------------------------------------------------------------------------

export type RequestBodyContentType =
  | "application/json"
  | "application/x-www-form-urlencoded"
  | "multipart/form-data"
  | "text/plain"
  | (string & {});

export interface RequestBodyDefinition<TSchema extends ZodType = ZodType> {
  /** Media type the body is parsed as (default `application/json`). */
  readonly contentType?: RequestBodyContentType;
  readonly schema: TSchema;
  readonly description?: string;
  /** Default true. */
  readonly required?: boolean;
}

export interface ResponseDefinition<
  TSchema extends ZodType | undefined = ZodType | undefined,
> {
  readonly description: string;
  /** Omit for empty responses (204, 304, redirects, ...). */
  readonly schema?: TSchema;
  /** Media type of the response body (default `application/json`). */
  readonly contentType?: string;
  /** Documented response headers. */
  readonly headers?: ZodObject;
}

export type ResponsesDefinition = Readonly<Record<number, ResponseDefinition>>;

export interface OperationRequestDefinition<
  TParams extends ZodObject | undefined = ZodObject | undefined,
  TQuery extends ZodObject | undefined = ZodObject | undefined,
  THeaders extends ZodObject | undefined = ZodObject | undefined,
  TBody extends RequestBodyDefinition | undefined = RequestBodyDefinition | undefined,
> {
  /** Path parameters; keys must match the `{placeholders}` in `path`. */
  readonly params?: TParams;
  /** Query string parameters (repeated keys arrive as `string[]`). */
  readonly query?: TQuery;
  /** Request headers (lower-case keys). */
  readonly headers?: THeaders;
  readonly body?: TBody;
}

// ---------------------------------------------------------------------------
// Type inference helpers
// ---------------------------------------------------------------------------

export type InferParsed<T> = T extends ZodType
  ? z.output<T>
  : Readonly<Record<string, never>>;

export type InferBody<T> = T extends RequestBodyDefinition<infer S>
  ? S extends ZodType
    ? z.output<S>
    : undefined
  : undefined;

export type ResponseStatusOf<TResponses extends ResponsesDefinition> = Extract<
  keyof TResponses,
  number
>;

export type ResponseBodyOf<
  TResponses extends ResponsesDefinition,
  S extends keyof TResponses,
> = TResponses[S] extends { readonly schema: infer TSchema }
  ? TSchema extends ZodType
    ? z.output<TSchema>
    : undefined
  : undefined;

export type EmptyResponseStatusOf<TResponses extends ResponsesDefinition> = {
  [S in ResponseStatusOf<TResponses>]: TResponses[S] extends {
    readonly schema: ZodType;
  }
    ? never
    : S;
}[ResponseStatusOf<TResponses>];

// ---------------------------------------------------------------------------
// Authenticated principal handed to handlers
// ---------------------------------------------------------------------------

/**
 * Result of a successful credential resolution for one auth scheme. Built
 * by the {@link AuthResolver} registered for the scheme, so its `user` type
 * is whatever the host application resolves (e.g. `UserData` from
 * `@schemavaults/auth-common` on the auth server).
 */
export interface AuthPrincipal<TUser = unknown> {
  /** Name of the auth scheme whose resolver produced this principal. */
  readonly scheme: string;
  /** Resolved user, or null for non-user principals (client credentials, api keys). */
  readonly user: TUser | null;
  /** Platform administrator flag, used for the "admin" route guard and org bypass. */
  readonly isAdmin: boolean;
  /**
   * Space separated scope string granted to the presented token (RFC 6749
   * §3.3), or null when the credential carries no scope claim.
   */
  readonly scope: string | null;
  /** OAuth client id for client-credential style principals. */
  readonly clientId?: string;
  /**
   * Resolves the principal's membership role in an organization, used for
   * {@link OrganizationRoleRequirement}. Absent means "cannot be a member".
   */
  readonly getOrganizationRole?: (
    organizationId: string,
  ) => Promise<OrganizationMembershipRoleType | false>;
}

// ---------------------------------------------------------------------------
// Handler context
// ---------------------------------------------------------------------------

export interface ResponseInit_ {
  readonly headers?: HeadersInit;
}

export interface OperationHandlerContext<
  TParams,
  TQuery,
  THeaders,
  TBody,
  TResponses extends ResponsesDefinition,
  TContext,
  TAuth,
> {
  readonly params: TParams;
  readonly query: TQuery;
  readonly headers: THeaders;
  readonly body: TBody;
  /** Resolved principal, or null on public operations. */
  readonly auth: TAuth;
  /** Host-provided per-request context (database handle, environment, ...). */
  readonly context: TContext;
  readonly request: Request;
  readonly url: URL;
  /** Type-checked JSON response for one of the declared status codes. */
  json<S extends ResponseStatusOf<TResponses>>(
    status: S,
    body: ResponseBodyOf<TResponses, S>,
    init?: ResponseInit_,
  ): Response;
  /** Body-less response for a declared status code without a schema. */
  empty(status: EmptyResponseStatusOf<TResponses>, init?: ResponseInit_): Response;
  redirect(location: string, status?: 301 | 302 | 303 | 307 | 308): Response;
}

export type OperationHandlerResult = Response | Promise<Response>;

// ---------------------------------------------------------------------------
// Operation definition
// ---------------------------------------------------------------------------

export interface OperationDefinition<
  TParams extends ZodObject | undefined = ZodObject | undefined,
  TQuery extends ZodObject | undefined = ZodObject | undefined,
  THeaders extends ZodObject | undefined = ZodObject | undefined,
  TBody extends RequestBodyDefinition | undefined = RequestBodyDefinition | undefined,
  TResponses extends ResponsesDefinition = ResponsesDefinition,
  TContext = unknown,
  TUser = unknown,
  TAuth extends OperationAuth = OperationAuth,
> {
  readonly method: HttpMethod;
  /** OpenAPI style path with `{param}` placeholders, e.g. `/api/apps/{app_id}`. */
  readonly path: string;
  /** Unique id; defaults to `<method>_<path>` slug. */
  readonly operationId: string;
  readonly summary: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly deprecated?: boolean;
  readonly auth: TAuth;
  readonly request: OperationRequestDefinition<TParams, TQuery, THeaders, TBody>;
  readonly responses: TResponses;
  /** Extra OpenAPI vendor extensions merged into the operation object. */
  readonly extensions?: Readonly<Record<`x-${string}`, unknown>>;
  // Declared as a method (not a property) so operation definitions with
  // narrower context types remain assignable to AnyOperationDefinition.
  handler(
    ctx: OperationHandlerContext<
      InferParsed<TParams>,
      InferParsed<TQuery>,
      InferParsed<THeaders>,
      InferBody<TBody>,
      TResponses,
      TContext,
      TAuth extends PublicOperationAuth ? null : AuthPrincipal<TUser>
    >,
  ): OperationHandlerResult;
}

/**
 * Structural, type-erased view of any operation definition. Every
 * `OperationDefinition<...>` is assignable to it, so heterogeneous
 * operation lists can be passed to `buildOpenApiDocument` and
 * `createOperationsApp`.
 */
export interface AnyOperationDefinition {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly deprecated?: boolean;
  readonly auth: OperationAuth;
  readonly request: OperationRequestDefinition;
  readonly responses: ResponsesDefinition;
  readonly extensions?: Readonly<Record<`x-${string}`, unknown>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler(ctx: any): OperationHandlerResult;
}

export interface OperationInput<
  TParams extends ZodObject | undefined,
  TQuery extends ZodObject | undefined,
  THeaders extends ZodObject | undefined,
  TBody extends RequestBodyDefinition | undefined,
  TResponses extends ResponsesDefinition,
  TContext,
  TUser,
  TAuth extends OperationAuth,
> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId?: string;
  readonly summary: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly deprecated?: boolean;
  readonly auth: TAuth;
  readonly request?: OperationRequestDefinition<TParams, TQuery, THeaders, TBody>;
  readonly responses: TResponses;
  readonly extensions?: Readonly<Record<`x-${string}`, unknown>>;
  readonly handler: OperationDefinition<
    TParams,
    TQuery,
    THeaders,
    TBody,
    TResponses,
    TContext,
    TUser,
    TAuth
  >["handler"];
}

export type OperationDefiner<TContext, TUser> = <
  const TParams extends ZodObject | undefined = undefined,
  const TQuery extends ZodObject | undefined = undefined,
  const THeaders extends ZodObject | undefined = undefined,
  const TBody extends RequestBodyDefinition | undefined = undefined,
  const TResponses extends ResponsesDefinition = ResponsesDefinition,
  const TAuth extends OperationAuth = OperationAuth,
>(
  input: OperationInput<
    TParams,
    TQuery,
    THeaders,
    TBody,
    TResponses,
    TContext,
    TUser,
    TAuth
  >,
) => OperationDefinition<
  TParams,
  TQuery,
  THeaders,
  TBody,
  TResponses,
  TContext,
  TUser,
  TAuth
>;

export function defaultOperationId(method: HttpMethod, path: string): string {
  const slug = path
    .replace(/[{}]/g, "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("_")
    .replace(/[^A-Za-z0-9_]+/g, "_");
  return slug.length > 0 ? `${method}_${slug}` : method;
}

function validateOperationInput(input: {
  method: HttpMethod;
  path: string;
  request?: OperationRequestDefinition;
  responses: ResponsesDefinition;
  summary: string;
}): void {
  if (!isHttpMethod(input.method)) {
    throw new TypeError(`Unsupported HTTP method "${String(input.method)}"`);
  }
  if (!isOpenApiPath(input.path)) {
    throw new TypeError(
      `Operation path "${input.path}" must start with "/" and use {param} placeholders`,
    );
  }
  if (typeof input.summary !== "string" || input.summary.trim().length === 0) {
    throw new TypeError(`Operation ${input.method.toUpperCase()} ${input.path} needs a summary`);
  }
  const placeholders = extractPathParameterNames(input.path);
  const declared: string[] = input.request?.params
    ? Object.keys(input.request.params.shape)
    : [];
  for (const name of placeholders) {
    if (!declared.includes(name)) {
      throw new TypeError(
        `Path parameter {${name}} of ${input.path} is not declared in request.params`,
      );
    }
  }
  for (const name of declared) {
    if (!placeholders.includes(name)) {
      throw new TypeError(
        `request.params declares "${name}" but ${input.path} has no {${name}} placeholder`,
      );
    }
  }
  if (input.request?.body && !HTTP_METHODS_WITH_REQUEST_BODY.has(input.method)) {
    throw new TypeError(
      `${input.method.toUpperCase()} ${input.path} declares a request body, which is not allowed for that method`,
    );
  }
  const statuses = Object.keys(input.responses);
  if (statuses.length === 0) {
    throw new TypeError(`${input.method.toUpperCase()} ${input.path} declares no responses`);
  }
  for (const status of statuses) {
    const code = Number(status);
    if (!Number.isInteger(code) || code < 100 || code > 599) {
      throw new TypeError(`Invalid response status "${status}" on ${input.path}`);
    }
  }
}

/**
 * Creates a `defineOperation` bound to the host application's per-request
 * context and resolved user types:
 *
 * ```ts
 * const defineOperation = createOperationDefiner<{ dbh: Kysely<AuthDatabase> }, UserData>();
 * ```
 */
export function createOperationDefiner<
  TContext = unknown,
  TUser = unknown,
>(): OperationDefiner<TContext, TUser> {
  return function defineOperationForContext(input) {
    validateOperationInput(input);
    const operation = {
      method: input.method,
      path: input.path,
      operationId: input.operationId ?? defaultOperationId(input.method, input.path),
      summary: input.summary,
      description: input.description,
      tags: Object.freeze([...(input.tags ?? [])]),
      deprecated: input.deprecated,
      auth: input.auth,
      request: input.request ?? {},
      responses: input.responses,
      extensions: input.extensions,
      handler: input.handler,
    };
    return Object.freeze(operation) as ReturnType<OperationDefiner<TContext, TUser>>;
  } as OperationDefiner<TContext, TUser>;
}

/** Untyped-context `defineOperation`; prefer {@link createOperationDefiner} in apps. */
export const defineOperation: OperationDefiner<unknown, unknown> =
  createOperationDefiner<unknown, unknown>();

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export interface OperationGroup {
  /** Tags applied to every operation (prepended to the operation's own). */
  readonly tags?: readonly string[];
  /** Path prefix (OpenAPI style) prepended to every operation path. */
  readonly pathPrefix?: string;
  readonly operations: readonly AnyOperationDefinition[];
}

/**
 * Flattens a group into standalone operations, applying the shared tags and
 * path prefix. The result can be passed to `buildOpenApiDocument` and
 * `createOperationsApp` like any other operation list.
 */
export function defineOperationGroup(group: OperationGroup): AnyOperationDefinition[] {
  const prefix = group.pathPrefix ?? "";
  if (prefix.length > 0 && !isOpenApiPath(prefix)) {
    throw new TypeError(`Group pathPrefix "${prefix}" must start with "/"`);
  }
  return group.operations.map((operation): AnyOperationDefinition => {
    const path = prefix.length > 0 ? `${prefix.replace(/\/+$/, "")}${operation.path}` : operation.path;
    const tags = Array.from(new Set([...(group.tags ?? []), ...operation.tags]));
    return Object.freeze({ ...operation, path, tags });
  });
}

export function assertUniqueOperations(operations: readonly AnyOperationDefinition[]): void {
  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const operation of operations) {
    if (ids.has(operation.operationId)) {
      throw new TypeError(`Duplicate operationId "${operation.operationId}"`);
    }
    ids.add(operation.operationId);
    const route = `${operation.method} ${operation.path}`;
    if (routes.has(route)) {
      throw new TypeError(`Duplicate route ${route.toUpperCase()}`);
    }
    routes.add(route);
  }
}
