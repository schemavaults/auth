export interface DeleteOrganizationParams {
  organization_id: string;
}

export interface DeleteOrganizationResult {
  success: boolean;
  status_code: number;
  message?: string;
}

export default function deleteOrganization(
  params: DeleteOrganizationParams,
): Cypress.Chainable<DeleteOrganizationResult> {
  const { organization_id } = params;

  if (typeof organization_id !== "string" || !organization_id) {
    throw new TypeError("'organization_id' must be a non-empty string");
  }

  return cy
    .request({
      method: "DELETE",
      url: `/api/organizations/${organization_id}`,
      failOnStatusCode: false,
    })
    .then((response): Cypress.Chainable<DeleteOrganizationResult> => {
      if (response.status === 200 && response.body?.success) {
        const result: DeleteOrganizationResult = {
          success: true,
          status_code: response.status,
        };
        return cy.wrap(result, { log: false });
      }

      cy.log(
        `Failed to delete organization: ${response.body?.message || "Unknown error"}`,
      );
      const failedResult: DeleteOrganizationResult = {
        success: false,
        status_code: response.status,
        message: response.body?.message,
      };
      return cy.wrap(failedResult, { log: false });
    });
}
