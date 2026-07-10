// Verifies the auth-server protects the hardcoded core SchemaVaults apps and
// API servers from being deleted via the management API, even when the caller
// is the global superuser admin.
//
// See:
//   - auth-server/src/app/api/apps/[app_id]/DELETE_app_handler.ts
//   - auth-server/src/app/api/apis/[api_server_id]/DELETE_api_server_handler.ts
//   - getHardcodedSchemaVaultsApps() / getHardcodedSchemaVaultsApis()
//     in @schemavaults/app-definitions
//
// Equivalent to SystemOrganizationProtection.cy.ts but for the hardcoded app /
// API server resources.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

describe("Hardcoded Resource Deletion Protection", () => {
  // Pick one representative ID per resource category. Each test asserts on a
  // single ID so a failure pinpoints exactly which protection regressed.
  // The auth app/API is the only hardcoded resource since the whitelabel
  // refactor trimmed the hardcoded app/API definitions down to it; its id is
  // env-var driven (SCHEMAVAULTS_AUTH_SERVER_APP_ID), so resolve it from the
  // Cypress env rather than hardcoding "schemavaults-auth".
  const HARDCODED_APP_ID = getAuthServerAppIdFromCypressEnv();
  const HARDCODED_API_SERVER_ID = getAuthServerAppIdFromCypressEnv();

  it("DELETE /api/apps/:hardcoded_app_id returns 403 for the superuser admin", () => {
    cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }

      cy.request({
        method: "DELETE",
        url: `/api/apps/${HARDCODED_APP_ID}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body).to.have.property("success", false);
        expect(String(response.body.message).toLowerCase()).to.include(
          "hardcoded",
        );
      });
    });
  });

  it("DELETE /api/apis/:hardcoded_api_server_id returns 403 for the superuser admin", () => {
    cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }

      cy.request({
        method: "DELETE",
        url: `/api/apis/${HARDCODED_API_SERVER_ID}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body).to.have.property("success", false);
        expect(String(response.body.message).toLowerCase()).to.include(
          "hardcoded",
        );
      });
    });
  });
});
