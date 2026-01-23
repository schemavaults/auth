"use client";

import { useState, useCallback, useTransition } from "react";
import PageContainer from "@/components/PageContainer";
import useSWR, { SWRResponse } from "swr";
import type { ReactElement } from "react";
import { type ApiServerId, apiServerIdSchema } from "@schemavaults/app-definitions";
import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cn } from "@schemavaults/ui";
import { CheckCircle, ClipboardCopy, KeyRound, Loader2, RotateCcw } from "lucide-react";
import JwksAccessKeysUsageInstructions from "./jwks-access-keys-usage-instructions";
import type { JwksAccessKeyStatusQueryResponse } from "@/lib/auth-db/jwks-access-keys";

export interface JwksAccessKeysPageViewProps {
  api_server_id: ApiServerId
  preloaded_latest_jwks_access_keys_metadata: JwksAccessKeyStatusQueryResponse | null;
}

interface SuccessKeyMetadataResponse {
  success: true;
  key_metadata: JwksAccessKeyStatusQueryResponse | false;
}

type KeyMetadataResponse = SuccessKeyMetadataResponse | { success: false };

interface GenerateKeyResponse {
  success: boolean;
  message: string;
  key_id?: string;
  private_key?: string;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function DisplayGeneratedPrivateKeyForOneTimeCopy({ generatedPrivateKey }: { generatedPrivateKey: string }): ReactElement {
  const [copied, setCopied] = useState<boolean>(false);
  const handleCopyKey = useCallback(async () => {
    if (!generatedPrivateKey) return;

    try {
      await navigator.clipboard.writeText(generatedPrivateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy to clipboard:", e);
    }
  }, [generatedPrivateKey]);

  return (
    <Card className={cn(
    "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
    )}>
      <CardHeader>
        <CardTitle>Private Key Generated - Save This Now!</CardTitle>
        <CardDescription>
          This private key will only be shown once. Store it securely in
          your API server configuration. You will not be able to retrieve it again.
        </CardDescription>
      </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs whitespace-pre-wrap break-all">
              {generatedPrivateKey}
            </pre>
            <Button
              onClick={handleCopyKey}
              className={cn(
                "absolute top-2 right-2",
                "px-3 py-1",
                "bg-gray-700 hover:bg-gray-600",
                "text-white text-xs",
                "rounded",
                "flex flex-row flex-nowrap gap-2"
              )}
            >
              { copied ? <CheckCircle className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4"/> } {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

        </CardContent>
    </Card>
  )
}

interface ApiJwksAccessKeysStatusCardProps {
  isGenerating: boolean;
  keypairStatus: SWRResponse<KeyMetadataResponse>;
  handleGenerateKey: () => void;
  handleRegenerateKey: () => void;
}

function ApiJwksAccessKeysStatusCard(
  { isGenerating, keypairStatus, handleGenerateKey, handleRegenerateKey }: ApiJwksAccessKeysStatusCardProps
): ReactElement {
  const {
    data: keyData,
    error: loadKeyError
  } = keypairStatus;

  function KeyStatusCardContent(): ReactElement {
    if (!keyData && !loadKeyError) {
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

    if (keyData && !keyData.key_metadata) {
      return (
        <p className="text-gray-600 dark:text-gray-400">
          No JWKS access key has been generated for this API server yet.
        </p>
      );
    }

    if (keyData && keyData.key_metadata) {
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
        <KeyStatusCardContent />
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

function JwksAccessKeysPageView({ api_server_id, preloaded_latest_jwks_access_keys_metadata }: JwksAccessKeysPageViewProps): ReactElement {
  if (typeof api_server_id !== 'string') {
    throw new TypeError("Expected 'api_server_id' to be a string!")
  } else {
    console.log(`[JwksAccessKeysPageView] api_server_id: '${api_server_id}'`)
  }

  const [generatedPrivateKey, setGeneratedPrivateKey] = useState<string | null>(
    null
  );
  const [isGenerating, startGenerating] = useTransition();
  const [generationError, setGenerationError] = useState<string | null>(null);


  const keypairStatus: SWRResponse<KeyMetadataResponse> = useSWR<KeyMetadataResponse>(
    api_server_id ? `/api/apis/${api_server_id}/jwks-access-key` : null,
    fetcher,
    {
      fallbackData: typeof preloaded_latest_jwks_access_keys_metadata === 'object' && preloaded_latest_jwks_access_keys_metadata ? {
        success: true,
        key_metadata: preloaded_latest_jwks_access_keys_metadata ?? false
      } : undefined
    }
  );
  const mutate = keypairStatus.mutate;

  const handleGenerateKey = useCallback((): void => {
    if (!api_server_id) return;

    setGenerationError(null);
    setGeneratedPrivateKey(null);

    startGenerating(async () => {
      const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(api_server_id)
      if (!parsed_api_server_id.success) {
        setGenerationError(`Bad API server ID to generate key for: ${JSON.stringify(parsed_api_server_id.error)}`);
        return;
      }

      try {
        const response = await fetch(
          `/api/apis/${api_server_id}/jwks-access-key`,
          {
            method: "POST",
            credentials: "include",
          }
        );

        const data: GenerateKeyResponse = await response.json();

        if (!response.ok || !data.success) {
          setGenerationError(data.message || "Failed to generate key");
          return;
        }

        if (data.private_key) {
          setGeneratedPrivateKey(data.private_key);
        }

        mutate();
      } catch (e: unknown) {
        setGenerationError("Failed to generate key. Please try again.");
        console.error(e);
      }
    })
  }, [api_server_id, mutate]);

  const handleRegenerateKey = useCallback(async () => {
    if (!api_server_id) return;

    const confirmed = window.confirm(
      "Are you sure you want to regenerate the key? This will invalidate all existing keys and any API servers using the old key will lose access."
    );

    if (!confirmed) return;

    setGenerationError(null);
    setGeneratedPrivateKey(null);

    startGenerating(async () => {
      try {
        const response = await fetch(
          `/api/apis/${api_server_id}/jwks-access-key/regenerate`,
          {
            method: "POST",
            credentials: "include",
          }
        );

        const data: GenerateKeyResponse = await response.json();

        if (!response.ok || !data.success) {
          setGenerationError(data.message || "Failed to regenerate key");
          return;
        }

        if (data.private_key) {
          setGeneratedPrivateKey(data.private_key);
        }

        mutate();
      } catch (e: unknown) {
        setGenerationError("Failed to regenerate key. Please try again.");
        console.error(e);
      }
    })
  }, [api_server_id, mutate]);

  return (
    <PageContainer>
      {/** Header Section */}
      <Card>
        <CardHeader>
          <CardTitle>JWKS Access Keys</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Manage JWKS access keys for API server: <code>{api_server_id}</code></p>
        </CardContent>
      </Card>

      {generationError && (
        <Alert variant={'destructive'} className="bg-background">
          <AlertTitle>Error generating JWKS access keyset</AlertTitle>
          <AlertDescription>
            { generationError }
          </AlertDescription>
        </Alert>
      )}

      {generatedPrivateKey && (
        <DisplayGeneratedPrivateKeyForOneTimeCopy generatedPrivateKey={generatedPrivateKey} />
      )}

      <ApiJwksAccessKeysStatusCard isGenerating={isGenerating} keypairStatus={keypairStatus} handleGenerateKey={handleGenerateKey} handleRegenerateKey={handleRegenerateKey} />

      <JwksAccessKeysUsageInstructions api_server_id={api_server_id} />

    </PageContainer>
  );
}

export default JwksAccessKeysPageView;
