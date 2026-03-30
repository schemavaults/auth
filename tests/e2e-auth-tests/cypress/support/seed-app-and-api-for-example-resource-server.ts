export async function seedAppAndApiForExampleResourceServer(
  auth_server_url: string,
  new_api_id: string,
  new_app_url: string,
  jwks_access_public_key: string,
): Promise<void> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  const response = await fetch(
    `${auth_server_url}/api/test/seed/create-test-nextjs-app/${new_api_id}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: new_app_url,
        jwks_access_public_key,
      }),
    },
  );
  if (!response.ok || response.status !== 200) {
    throw new Error(
      `Failed to seed auth-server with details about example resource server! ${response.status} ${response.statusText}`,
    );
  }
  return;
}

export default seedAppAndApiForExampleResourceServer;
