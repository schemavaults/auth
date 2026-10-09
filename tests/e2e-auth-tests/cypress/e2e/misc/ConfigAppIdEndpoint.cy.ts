// Covers GET /api/config/app-id, the unauthenticated endpoint that exposes
// the deployment's own SCHEMAVAULTS_AUTH_SERVER_APP_ID so resource servers
// and scaffolding tools (@schemavaults/init-next-app) can configure
// themselves for it. The white_label suite pins the custom id in
// WhiteLabelAppId.cy.ts; here it must match whatever id the suite runs with.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

interface AppIdConfigResponseBody {
  error: boolean;
  success: boolean;
  message: string;
  data?: { app_id: string };
}

describe("GET /api/config/app-id", () => {
  it("returns the auth server's own app id without a session", () => {
    cy.clearCookies();
    cy.request<AppIdConfigResponseBody>({
      method: "GET",
      url: "/api/config/app-id",
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.error).to.eq(false);
      expect(response.body.data?.app_id).to.eq(getAuthServerAppIdFromCypressEnv());
    });
  });
});
