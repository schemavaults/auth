// Covers the admin-accepted path of GET /api/admin/server-traces (the 401
// and 403 guards live in misc/UnauthenticatedApiRequests.cy.ts and
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

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("GET /api/admin/server-traces", () => {
  it("returns the recorded server traces, newest first, for an admin", () => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });

    cy.request<ListServerTracesResponseBody>({
      method: "GET",
      url: "/api/admin/server-traces",
    }).then((response) => {
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
});
