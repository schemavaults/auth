import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

interface Reported {
  err: unknown;
  opts: { op_name?: string; route?: string; context?: unknown };
}
const reported: Reported[] = [];
const report = async (err: unknown, opts: Reported["opts"] = {}): Promise<void> => {
  reported.push({ err, opts });
};
mock.module("@/lib/reportServerException", () => ({
  default: report,
  reportServerException: report,
}));

const { z, publicAccess } = await import("@schemavaults/openapi-operations");
const { createApiApp } = await import("./app");
const { defineOperation } = await import("./context");

const thing = defineOperation({
  method: "get",
  path: "/api/thing/{id}",
  summary: "Thing",
  description: "A test operation.",
  tags: [],
  auth: publicAccess(),
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "ok", schema: z.object({ ok: z.boolean() }) } },
  handler: (ctx) => ctx.json(200, { ok: true }),
});

const broken = defineOperation({
  method: "get",
  path: "/api/broken",
  summary: "Broken",
  description: "A test operation whose handler throws.",
  tags: [],
  auth: publicAccess(),
  responses: { 200: { description: "ok", schema: z.object({ ok: z.boolean() }) } },
  handler: () => {
    throw new Error("handler exploded");
  },
});

beforeEach(() => {
  reported.length = 0;
});

function onlyReport(): Reported {
  expect(reported).toHaveLength(1);
  const [first] = reported;
  if (!first) throw new Error("nothing was reported");
  return first;
}

async function silenced<T>(run: () => T | Promise<T>): Promise<T> {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = originalConsoleError;
  }
}

describe("createApiApp error capture", () => {
  test("records an error thrown by the route's middleware", async () => {
    const app = createApiApp([thing], {
      configure: (hono) => {
        hono.use("/api/thing/:id", async (_c, next) => {
          await next();
          throw new Error("cors lookup failed");
        });
      },
    });
    const response = await silenced(() => app.fetch(new Request("http://localhost/api/thing/abc")));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, error: "internal_server_error" });
    const report = onlyReport();
    expect((report.err as Error).message).toBe("cors lookup failed");
    expect(report.opts).toMatchObject({
      op_name: `${thing.operationId}.middleware`,
      route: "/api/thing/{id}",
      context: { method: "GET", path: "/api/thing/abc" },
    });
  });

  test("records an error thrown by the preflight handler", async () => {
    const app = createApiApp([thing], {
      preflight: () => {
        throw new Error("preflight lookup failed");
      },
    });
    const response = await silenced(() =>
      app.fetch(new Request("http://localhost/api/thing/abc", { method: "OPTIONS" })),
    );
    expect(response.status).toBe(500);
    expect(onlyReport().opts.op_name).toBe(`${thing.operationId}.preflight`);
  });

  test("records a handler error without leaving a database handle open", async () => {
    const app = createApiApp([broken]);
    const response = await silenced(() => app.fetch(new Request("http://localhost/api/broken")));
    expect(response.status).toBe(500);
    // The handler never opened the request's database handle, so the
    // failure is recorded through a handle of the reporter's own.
    const report = onlyReport();
    expect((report.err as Error).message).toBe("handler exploded");
    expect(report.opts).toMatchObject({ op_name: broken.operationId, route: "/api/broken" });
  });
});
