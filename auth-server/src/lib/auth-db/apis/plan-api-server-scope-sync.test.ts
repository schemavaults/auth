import { describe, expect, test } from "bun:test";
import {
  planApiServerScopeSync,
  type ExistingApiServerScope,
} from "./plan-api-server-scope-sync";

const READ: ExistingApiServerScope = {
  api_server_scope_id: "6f1c1f4e-8a39-4c43-9b3e-2f0d6a1d6a10",
  scope: "notes:read",
  description: "Read your notes.",
  allow_dynamic_clients: true,
};
const WRITE: ExistingApiServerScope = {
  api_server_scope_id: "0d2b4c1e-3f7a-4d0e-9b2a-7f3f2d1c8e5a",
  scope: "notes:write",
  description: "Write your notes.",
  allow_dynamic_clients: false,
};
const LEGACY: ExistingApiServerScope = {
  api_server_scope_id: "9a1e2b3c-4d5e-4f60-8a7b-1c2d3e4f5a6b",
  scope: "legacy:read",
  description: "Legacy access.",
  allow_dynamic_clients: true,
};

describe("planApiServerScopeSync", () => {
  test("creates every scope of a manifest for an API server without scopes", () => {
    const plan = planApiServerScopeSync(
      [],
      [
        { scope: "notes:read", description: "Read your notes." },
        { scope: "notes:write", description: "Write your notes.", allow_dynamic_clients: false },
      ],
    );
    expect(plan.created).toEqual([
      { scope: "notes:read", description: "Read your notes.", allow_dynamic_clients: true },
      { scope: "notes:write", description: "Write your notes.", allow_dynamic_clients: false },
    ]);
    expect(plan.updated).toEqual([]);
    expect(plan.unchanged).toEqual([]);
    expect(plan.not_in_manifest).toEqual([]);
  });

  test("reports matching scopes as unchanged", () => {
    const plan = planApiServerScopeSync(
      [READ, WRITE],
      [
        { scope: "notes:write", description: "Write your notes." },
        { scope: "notes:read", description: "Read your notes.", allow_dynamic_clients: true },
      ],
    );
    expect(plan.unchanged).toEqual(["notes:write", "notes:read"]);
    expect(plan.created).toEqual([]);
    expect(plan.updated).toEqual([]);
  });

  test("updates a changed description, keeping allow_dynamic_clients when the entry leaves it out", () => {
    const plan = planApiServerScopeSync(
      [WRITE],
      [{ scope: "notes:write", description: "Create, edit and delete your notes." }],
    );
    expect(plan.updated).toEqual([
      {
        api_server_scope_id: WRITE.api_server_scope_id,
        scope: "notes:write",
        description: "Create, edit and delete your notes.",
        allow_dynamic_clients: false,
        previous: { description: "Write your notes." },
      },
    ]);
  });

  test("applies allow_dynamic_clients on later syncs when the entry gives it", () => {
    const opened = planApiServerScopeSync(
      [WRITE],
      [{ scope: "notes:write", description: "Write your notes.", allow_dynamic_clients: true }],
    );
    expect(opened.updated).toEqual([
      {
        api_server_scope_id: WRITE.api_server_scope_id,
        scope: "notes:write",
        description: "Write your notes.",
        allow_dynamic_clients: true,
        previous: { allow_dynamic_clients: false },
      },
    ]);

    const closed = planApiServerScopeSync(
      [READ],
      [{ scope: "notes:read", description: "Read all your notes.", allow_dynamic_clients: false }],
    );
    expect(closed.updated[0]?.previous).toEqual({
      description: "Read your notes.",
      allow_dynamic_clients: true,
    });
    expect(closed.updated[0]?.allow_dynamic_clients).toBe(false);
  });

  test("reports defined scopes the manifest leaves out, oldest first, and never plans to delete them", () => {
    const plan = planApiServerScopeSync(
      [LEGACY, READ, WRITE],
      [{ scope: "notes:read", description: "Read your notes." }],
    );
    expect(plan.not_in_manifest).toEqual([
      { scope: "legacy:read", description: "Legacy access." },
      { scope: "notes:write", description: "Write your notes." },
    ]);
    expect(plan.unchanged).toEqual(["notes:read"]);
    expect(Object.keys(plan).sort()).toEqual(["created", "not_in_manifest", "unchanged", "updated"]);
  });

  test("an empty manifest changes nothing and lists every defined scope", () => {
    const plan = planApiServerScopeSync([READ, WRITE], []);
    expect(plan.created).toEqual([]);
    expect(plan.updated).toEqual([]);
    expect(plan.unchanged).toEqual([]);
    expect(plan.not_in_manifest.map((scope) => scope.scope)).toEqual(["notes:read", "notes:write"]);
  });

  test("mixes all four outcomes", () => {
    const plan = planApiServerScopeSync(
      [LEGACY, READ, WRITE],
      [
        { scope: "notes:share", description: "Share your notes." },
        { scope: "notes:read", description: "Read your notes." },
        { scope: "notes:write", description: "Write your notes.", allow_dynamic_clients: true },
      ],
    );
    expect(plan.created.map((scope) => scope.scope)).toEqual(["notes:share"]);
    expect(plan.updated.map((scope) => scope.scope)).toEqual(["notes:write"]);
    expect(plan.unchanged).toEqual(["notes:read"]);
    expect(plan.not_in_manifest.map((scope) => scope.scope)).toEqual(["legacy:read"]);
  });
});
