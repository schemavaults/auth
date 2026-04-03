export async function triggerTestEnvironmentDbMigration(
  auth_server_url: string,
): Promise<void> {
  const endpoint: string = `${auth_server_url}/api/test/seed/migrate-test-environment-db`;
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(
      `[triggerTestEnvironmentDbMigration] Attempt ${attempt}/${maxAttempts} - Sending POST request to: `,
      endpoint,
    );
    try {
      const response = await fetch(endpoint, {
        method: "POST",
      });
      if (response.status !== 200) {
        try {
          const body = await response.json();
          console.error(body);
        } catch (e: unknown) {
          void e;
        }
        throw new Error(
          "Received bad response status " +
            response.status +
            " " +
            response.statusText,
        );
      }

      const response_body = await response.json();
      if (typeof response_body !== "object" || !response_body) {
        throw new TypeError("Expected response body to be a JSON object!");
      }

      console.log(
        `[triggerTestEnvironmentDbMigration] DB migration appears to have been a success: `,
        response_body,
      );
      return;
    } catch (e: unknown) {
      console.error(
        `[triggerTestEnvironmentDbMigration] Attempt ${attempt}/${maxAttempts} failed: `,
        e,
      );
      if (attempt === maxAttempts) {
        throw new Error(
          "Failed to trigger test environment DB migration after " +
            maxAttempts +
            " attempts!",
        );
      }
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      console.log(
        `[triggerTestEnvironmentDbMigration] Retrying in ${delayMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export default triggerTestEnvironmentDbMigration;
