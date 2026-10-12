import type { Instrumentation } from "next";

/**
 * Last-resort capture to the ERRORS table for server errors that Next.js
 * itself catches: Server Components (and `generateMetadata`) that throw
 * while rendering, i.e. what `error.tsx` / `global-error.tsx` end up
 * displaying, route handlers outside the API runtime (`/branding/[asset]`),
 * and route modules that fail to load.
 *
 * API operations do not reach this hook: the operations runtime answers
 * their failures itself and records them (src/lib/api/app.ts). Neither do
 * `redirect()` / `notFound()`, which Next.js does not report as errors.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Prerendering at build time has no database to record into.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { reportServerException } = await import("@/lib/reportServerException");
  const digest: string | undefined =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  await reportServerException(error, {
    op_name: `next.${context.routeType}`,
    route: context.routePath,
    context: {
      method: request.method,
      // Without the query string, which can carry credentials (password
      // reset / email verification tokens, authorization codes).
      path: request.path.split("?")[0],
      router_kind: context.routerKind,
      route_type: context.routeType,
      render_source: context.renderSource,
      revalidate_reason: context.revalidateReason ?? null,
      digest: digest ?? null,
    },
  });
};
