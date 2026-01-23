"use client";

import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardFooter, CardHeader, CardTitle, cn } from "@schemavaults/ui";
import { KeyRound, Loader2 } from "lucide-react";
import type { SWRResponse } from "swr";
import type { KeyMetadataResponse } from "./KeyMetadataResponse";
import type { ReactElement } from "react";

interface ApiJwksAccessKeysStatusCardProps {
  isGenerating: boolean;
  keypairStatus: SWRResponse<KeyMetadataResponse>;
  handleGenerateKey: () => void;
  handleRegenerateKey: () => void;
}


function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function KeyStatusCardContent(
  { keypairStatus }: Pick<ApiJwksAccessKeysStatusCardProps, 'keypairStatus'>
): ReactElement {
  const {
    data: keyData,
    error: loadKeyError,
    isLoading
  } = keypairStatus;

  if (!keyData && !loadKeyError && isLoading) {
    return (
      <div className="flex flex-row flex-nowrap items-center justify-center gap-4">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (loadKeyError || !keyData || !keyData.success) {
    return (
      <Alert variant={'destructive'}>
        <AlertTitle>Error loading JWKS access key status</AlertTitle>
        <AlertDescription>
          { loadKeyError instanceof Error ? loadKeyError.message : "An unknown error occurred!"}
        </AlertDescription>
      </Alert>
    )
  }

  if (keyData && keyData.success && !keyData.key_metadata) {
    return (
      <p className="text-gray-600 dark:text-gray-400">
        No JWKS access key has been generated for this API server yet.
      </p>
    );
  }

  if (keyData && keyData.success && keyData.key_metadata) {
    return (
      <div>
        <dl className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div>
            <dt className="text-sm text-gray-500 dark:text-gray-400">
              Key Pair ID
            </dt>
            <dd className="font-mono text-sm">{keyData.key_metadata.key_id}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500 dark:text-gray-400">
              Created At
            </dt>
            <dd className="text-sm">
              {formatDate(keyData.key_metadata.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500 dark:text-gray-400">
              Status
            </dt>
            <dd>
              <span
                className={`inline-flex px-2 py-1 text-xs rounded-full ${
                  keyData.key_metadata.is_active
                    ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                    : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                }`}
              >
                {keyData.key_metadata.is_active ? "Active" : "Inactive"}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    )
  }

  return (
    <Alert variant={'destructive'}>
      <AlertTitle>Failed to resolve JWKS access key status</AlertTitle>
      <AlertDescription>
        Failed to parse JWKS access key metadata from query
      </AlertDescription>
    </Alert>
  )
}

export default function ApiJwksAccessKeysStatusCard(
  { isGenerating, keypairStatus, handleGenerateKey, handleRegenerateKey }: ApiJwksAccessKeysStatusCardProps
): ReactElement {
  const keyData = keypairStatus.data;

  const footerButtonStyles: string  = cn(
    "px-4 py-2 rounded-lg font-medium",
    "flex flex-row flex-nowrap gap-2 items-center"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Key Status</CardTitle>
      </CardHeader>
      <CardContent>
        <KeyStatusCardContent keypairStatus={keypairStatus} />
      </CardContent>
      { // Card Footer Action Button (generate/regenerate)
        keyData && (
          <CardFooter className="flex flex-row flex-wrap gap-2 justify-start items-center">
            {keyData.success && !keyData.key_metadata ? (
              <Button
                onClick={handleGenerateKey}
                disabled={isGenerating}
                className={footerButtonStyles}
              >
                <KeyRound className="h-4 w-4" /> {isGenerating ? "Generating..." : "Generate Keys"}
              </Button>
            ) : (
                <>
                  <Button
                    onClick={handleRegenerateKey}
                    disabled={isGenerating}
                    className={footerButtonStyles}
                    variant={'destructive'}
                  >
                    <KeyRound className={cn(
                      "h-4 w-4",
                    )} /> {isGenerating ? "Regenerating..." : "Regenerate Keys"}
                  </Button>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Regenerating will invalidate the current key.
                  </p>
                </>
            )}
          </CardFooter>
        )
      }
    </Card>
  )
}
