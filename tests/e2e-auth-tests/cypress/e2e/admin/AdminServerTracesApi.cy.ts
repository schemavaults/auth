// Covers the admin-accepted paths of GET /api/admin/server-traces and
// GET /api/admin/server-traces/operations (the 401 and 403 guards live in
// misc/UnauthenticatedApiRequests.cy.ts and
// admin/RegularUserAdminApiForbidden.cy.ts). Traces are recorded by the
// server for its own request handling, so a fresh login guarantees rows.

interface ServerTrace {
  event_id: string;
  op_name: string;
  op_category: string;
  start_time: number;
  end_time: number;
}

interface ListServerTracesResponseBody {
  success: boolean;
  message?: string;
  data?: { traces: ServerTrace[] };
}

interface ServerTraceOperation {
  op_name: string;
  op_category: string;
  count: number;
  last_seen: number;
}

interface ListServerTraceOperationsResponseBody {
  success: boolean;
  message?: string;
  data?: { operations: ServerTraceOperation[] };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function listTraces(
  query: string = "",
): Cypress.Chainable<Cypress.Response<ListServerTracesResponseBody>> {
  return cy.request<ListServerTracesResponseBody>({
    method: "GET",
    url: `/api/admin/server-traces${query}`,
    failOnStatusCode: false,
  });
}

describe("GET /api/admin/server-traces", () => {
  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  });

  it("returns the recorded server traces, newest first, for an admin", () => {
    listTraces().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      const traces = response.body.data?.traces ?? [];
      expect(traces, "traces").to.be.an("array").and.not.be.empty;
      expect(traces.length, "listing is capped").to.be.at.most(200);
      for (const trace of traces.slice(0, 5)) {
        expect(trace.event_id).to.be.a("string");
        expect(trace.op_name).to.be.a("string");
        expect(trace.op_category).to.be.a("string");
        expect(trace.start_time).to.be.a("number");
        expect(trace.end_time).to.be.a("number");
        expect(trace.end_time).to.be.at.least(trace.start_time);
      }
      for (let i = 1; i < traces.length; i++) {
        expect(
          traces[i - 1]!.start_time,
          `trace ${i - 1} is not older than trace ${i}`,
        ).to.be.at.least(traces[i]!.start_time);
      }
    });
  });

  it("returns at most `limit` traces", () => {
    listTraces("?limit=1").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.data?.traces).to.have.length(1);
    });
  });

  it("keeps only the requested operations and categories", () => {
    listTraces("?limit=1").then((first) => {
      const sample: ServerTrace | undefined = first.body.data?.traces[0];
      expect(sample, "a recorded trace").to.not.be.undefined;
      const query = new URLSearchParams({
        op_name: sample!.op_name,
        op_category: sample!.op_category,
        limit: "50",
      });
      listTraces(`?${query.toString()}`).then((response) => {
        expect(response.status).to.eq(200);
        const traces = response.body.data?.traces ?? [];
        expect(traces, "filtered traces").to.not.be.empty;
        for (const trace of traces) {
          expect(trace.op_name).to.eq(sample!.op_name);
          expect(trace.op_category).to.eq(sample!.op_category);
        }
      });
    });
  });

  it("keeps only traces that started at or after `since`", () => {
    const future: number = Date.now() + 24 * 60 * 60 * 1000;
    listTraces(`?since=${future}`).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.data?.traces).to.be.an("array").and.be.empty;
    });
    listTraces("?since=0&limit=5").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.data?.traces).to.be.an("array").and.not.be.empty;
    });
  });

  it("rejects malformed filters with 400", () => {
    for (const query of [
      "?limit=0",
      "?limit=5001",
      "?limit=abc",
      "?since=-1",
      "?op_category=not_a_category",
    ]) {
      listTraces(query).then((response) => {
        expect(response.status, query).to.eq(400);
        expect(response.body.success, query).to.eq(false);
      });
    }
  });
});

describe("GET /api/admin/server-traces/operations", () => {
  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  });

  it("lists every traced operation with its trace count, busiest first", () => {
    cy.request<ListServerTraceOperationsResponseBody>({
      method: "GET",
      url: "/api/admin/server-traces/operations",
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      const operations = response.body.data?.operations ?? [];
      expect(operations, "operations").to.be.an("array").and.not.be.empty;
      for (const operation of operations) {
        expect(operation.op_name).to.be.a("string").and.not.be.empty;
        expect(operation.op_category).to.be.a("string");
        expect(operation.count).to.be.a("number").and.be.at.least(1);
        expect(operation.last_seen).to.be.a("number");
      }
      for (let i = 1; i < operations.length; i++) {
        expect(operations[i - 1]!.count).to.be.at.least(operations[i]!.count);
      }

      // Each count matches what the listing returns for that operation.
      const busiest: ServerTraceOperation = operations[0]!;
      const query = new URLSearchParams({
        op_name: busiest.op_name,
        op_category: busiest.op_category,
        limit: "5000",
      });
      listTraces(`?${query.toString()}`).then((listing) => {
        expect(listing.body.data?.traces.length ?? 0).to.be.at.least(
          Math.min(busiest.count, 5000),
        );
      });
    });
  });

  it("counts only traces since `since`", () => {
    const future: number = Date.now() + 24 * 60 * 60 * 1000;
    cy.request<ListServerTraceOperationsResponseBody>({
      method: "GET",
      url: `/api/admin/server-traces/operations?since=${future}`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.data?.operations).to.be.an("array").and.be.empty;
    });
  });
});
