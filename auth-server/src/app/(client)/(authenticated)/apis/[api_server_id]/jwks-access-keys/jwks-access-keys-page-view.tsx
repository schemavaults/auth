"use client";

import { useState, useCallback, useTransition } from "react";
import PageContainer from "@/components/PageContainer";
import useSWR, { SWRResponse } from "swr";
import type { ReactElement } from "react";
import { type ApiServerId, apiServerIdSchema } from "@schemavaults/app-definitions";
import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@schemavaults/ui";
import { CheckCircle, ClipboardCopy } from "lucide-react";
import JwksAccessKeysUsageInstructions from "./jwks-access-keys-usage-instructions";
import type { SuccessKeyMetadataResponse, KeyMetadataResponse } from "./KeyMetadataResponse";
import ApiJwksAccessKeysStatusCard from "./jwks-access-keys-status-card";

export interface JwksAccessKeysPageViewProps {
  api_server_id: ApiServerId
  preloaded_latest_jwks_access_keys_metadata: SuccessKeyMetadataResponse;
}

interface GenerateKeyResponse {
  success: boolean;
  message: string;
  key_id?: string;
  private_key?: string;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());


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
      fallbackData: typeof preloaded_latest_jwks_access_keys_metadata === 'object' && preloaded_latest_jwks_access_keys_metadata ? preloaded_latest_jwks_access_keys_metadata : undefined
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
