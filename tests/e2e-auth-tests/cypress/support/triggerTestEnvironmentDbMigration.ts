export async function triggerTestEnvironmentDbMigration(
  auth_server_url: string,
): Promise<void> {
  const endpoint: string = `${auth_server_url}/api/test/seed/migrate-test-environment-db`;
  console.log(
    "[triggerTestEnvironmentDbMigration] Sending POST request to: ",
    endpoint,
  );
  let result: object;
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
    result = response_body;
  } catch (e: unknown) {
    console.error("Failed to trigger test environment DB migration: ", e);
    throw new Error("Failed to trigger test environment DB migration!");
  }

  console.log(
    `[triggerTestEnvironmentDbMigration] DB migration appears to have been a success: `,
    result,
  );
}

export default triggerTestEnvironmentDbMigration;
