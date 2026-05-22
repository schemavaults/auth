import type { CreateOrganizationParams } from "./create_organization";

/**
 * Faster equivalent of cy.create_organization(): creates an organization by
 * POSTing directly to /api/organizations instead of driving the
 * /admin/organizations creation dialog through the UI.
 *
 * The current session's refresh-token cookie authorizes the request, so the
 * caller must already be authenticated (the POST /api/organizations route
 * only requires authentication — the creating user becomes the new
 * organization's owner). In practice callers are the superuser, matching how
 * the UI helper is used.
 *
 * Intended for test *setup*. Specs that exercise the organization-creation
 * UI itself should keep using cy.create_organization().
 */
export default function createOrganizationViaRequest(
  params: CreateOrganizationParams,
): Cypress.Chainable<boolean> {
  const { organization_id, name } = params;

  if (typeof organization_id !== "string" || !organization_id) {
    throw new TypeError("'organization_id' must be a non-empty string");
  }

  if (typeof name !== "string" || !name) {
    throw new TypeError("'name' must be a non-empty string");
  }

  return cy
    .request({
      method: "POST",
      url: "/api/organizations",
      body: { organization_id, name },
      failOnStatusCode: false,
    })
    .then((response): Cypress.Chainable<boolean> => {
      if (response.status === 200 && response.body?.success) {
        cy.log(
          `Created organization '${organization_id}' ('${name}') via request`,
        );
        return cy.wrap(true, { log: false });
      }

      throw new Error(
        `Failed to create organization '${organization_id}' via request ` +
          `(status ${response.status}): ${
            response.body?.message ?? "Unknown error"
          }`,
      );
    });
}
