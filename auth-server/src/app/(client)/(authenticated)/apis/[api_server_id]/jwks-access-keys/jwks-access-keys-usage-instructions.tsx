"use client";

import type { ApiServerId, AppId } from "@schemavaults/app-definitions";
import { useAuthServerAppId } from "@schemavaults/auth-react-provider";
import { useAuthServerUrl } from "@/components/AuthServerUrl";
import { sign_verify_alg } from "@schemavaults/jwt";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@schemavaults/ui";
import type { ReactElement } from "react";

export interface JwksAccessKeysUsageInstructionsProps {
  api_server_id: ApiServerId;
}

export default function JwksAccessKeysUsageInstructions(
  { api_server_id }: JwksAccessKeysUsageInstructionsProps
): ReactElement {
  const jwks_endpoint: string = `/api/jwks/${api_server_id}`;
  const auth_server_url: string = useAuthServerUrl();
  const auth_server_app_id: AppId = useAuthServerAppId();
  const suggested_auth_server_env_vars: string = [
    `SCHEMAVAULTS_AUTH_SERVER_URL="${auth_server_url}"`,
    `SCHEMAVAULTS_AUTH_SERVER_APP_ID="${auth_server_app_id}"`,
  ].join("\n");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Instructions</CardTitle>
        <CardDescription>
          To authenticate requests to the JWKS endpoint, your API server needs to create a signed JWT assertion using your {"'JWKS Access Private Key'"}.
          If you are using @schemavaults/auth-server-sdk, you can simply set the <code>SCHEMAVAULTS_API_SERVER_ID</code>, <code>SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY</code>, <code>SCHEMAVAULTS_AUTH_SERVER_URL</code>, and <code>SCHEMAVAULTS_AUTH_SERVER_APP_ID</code> environment variables.
          Otherwise, you can manually sign a token (see the <code>createJwksAccessProofToken</code> method of <code>@schemavaults/jwt</code>) to prove that you are allowed to download the JSON Web Key Set:
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>
            Create a signed token (<code>{ sign_verify_alg satisfies string }</code>) with the <code>createJwksAccessProofToken</code> method of the <code>@schemavaults/jwt</code> package (and your private key!).
          </li>
          <li>
            Send it as a Bearer token in the Authorization header when calling the {" "}
            <code>/api/jwks/{"{audience}"}</code> endpoint (i.e. Get your JWKS for this API server from: <code>{ jwks_endpoint }</code>).
          </li>
          <li>
            This should allow you to receive the JWKS for your API server-- you can use the keys you receive to verify that tokens were signed and encrypted by <code>@schemavaults/auth-server</code>!
          </li>
        </ol>
        <div className="mt-4 space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your resource server also needs to know which auth server deployment to talk to.
            Point it at this auth server by setting <code>SCHEMAVAULTS_AUTH_SERVER_URL</code> and <code>SCHEMAVAULTS_AUTH_SERVER_APP_ID</code>:
          </p>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs whitespace-pre-wrap break-all">
            {suggested_auth_server_env_vars}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}
