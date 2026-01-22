"use client";

import type { ApiServerId } from "@schemavaults/app-definitions";
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Instructions</CardTitle>
        <CardDescription>
          To authenticate requests to the JWKS endpoint, your API server needs to create a signed JWT assertion using your 'JWKS Access Key' private key:
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>
            Create a JWT with <code>sub</code> set to your API server ID (i.e. <code>{ api_server_id }</code>).
          </li>
          <li>
            Sign it using the { sign_verify_alg } algorithm with your private key.
          </li>
          <li>
            Send it as a Bearer token in the Authorization header when calling the {" "}
            <code>/api/jwks/{"{audience}"}</code> endpoint (i.e. Get your JWKS for this API server from: <code>{ jwks_endpoint }</code>).
          </li>
          <li>
            This should allow you to receive the JWKS for your API server-- you can use the keys you receive to verify that users have authenticated with SchemaVaults Auth!
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}
