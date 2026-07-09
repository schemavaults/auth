import {
  PKCE_ProofKeyManager,
  EmailRegistrationCredentials,
} from "@schemavaults/auth-common";
import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";

async function preRegisterSuperuser(
  auth_server_url: string,
  test_suite_name: string,
  credentials: EmailRegistrationCredentials,
): Promise<void> {
  const endpoint = `${auth_server_url}/api/auth/register`;
  console.log(
    `[preRegisterSuperuser] Pre-registering superuser for test suite '${test_suite_name}'...`,
  );

  const challenge_time = Date.now();
  const codeVerifier = PKCE_ProofKeyManager.createCodeVerifier(challenge_time);
  const codeChallenge =
    await PKCE_ProofKeyManager.createCodeChallenge(codeVerifier);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credentials: {
        email: credentials["email"],
        password: credentials["password"],
      },
      invite_code: credentials["invite_code"],
      client_app_id: DEFAULT_AUTH_SERVER_APP_ID,
      code_challenge: codeChallenge.code_challenge,
      challenge_time,
    }),
  });

  if (response.status === 200) {
    console.log("[preRegisterSuperuser] Superuser registered successfully.");
    return;
  } else if (response.status === 409) {
    console.log("[preRegisterSuperuser] Superuser already exists.");
    return;
  } else {
    const body = await response.json().catch(() => null);
    console.error("[preRegisterSuperuser] Failed:", response.status, body);
    throw new Error(
      `Failed to pre-register superuser! Status: ${response.status}`,
    );
  }
}

export default preRegisterSuperuser;
