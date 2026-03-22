export interface GenerateJwksAccessKeyResult {
  success: boolean;
  key_id: string | null;
  private_key: string | null;
}

export default function generateJwksAccessKey(
  api_server_id: string,
): Cypress.Chainable<GenerateJwksAccessKeyResult> {
  if (typeof api_server_id !== "string" || !api_server_id) {
    throw new TypeError("'api_server_id' must be a non-empty string");
  }

  return cy
    .request({
      method: "POST",
      url: `/api/apis/${api_server_id}/jwks-access-key`,
      failOnStatusCode: false,
    })
    .then((response): Cypress.Chainable<GenerateJwksAccessKeyResult> => {
      if (response.status === 200 && response.body?.success) {
        const result: GenerateJwksAccessKeyResult = {
          success: true,
          key_id: response.body.key_id as string,
          private_key: response.body.private_key as string,
        };
        return cy.wrap(result, { log: false });
      }

      cy.log(
        `Failed to generate JWKS access key: ${response.body?.message || "Unknown error"}`,
      );
      const failedResult: GenerateJwksAccessKeyResult = {
        success: false,
        key_id: null,
        private_key: null,
      };
      return cy.wrap(failedResult, { log: false });
    });
}
