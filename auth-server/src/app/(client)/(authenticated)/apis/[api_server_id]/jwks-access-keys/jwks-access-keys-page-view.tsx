"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import PageContainer from "@/components/PageContainer";
import useSWR from "swr";
import type { ReactElement } from "react";

interface KeyMetadata {
  key_id: string;
  created_at: number;
  is_active: boolean;
}

interface KeyMetadataResponse {
  success: boolean;
  has_key: boolean;
  key: KeyMetadata | null;
}

interface GenerateKeyResponse {
  success: boolean;
  message: string;
  key_id?: string;
  private_key?: string;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());

function JwksAccessKeysPageView(): ReactElement {
  const params = useParams();
  const api_server_id = params?.api_server_id as string;

  const [generatedPrivateKey, setGeneratedPrivateKey] = useState<string | null>(
    null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    data: keyData,
    error: keyError,
    mutate,
  } = useSWR<KeyMetadataResponse>(
    api_server_id ? `/api/apis/${api_server_id}/jwks-access-key` : null,
    fetcher
  );

  const handleGenerateKey = useCallback(async () => {
    if (!api_server_id) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedPrivateKey(null);

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
        setError(data.message || "Failed to generate key");
        return;
      }

      if (data.private_key) {
        setGeneratedPrivateKey(data.private_key);
      }

      mutate();
    } catch (e: unknown) {
      setError("Failed to generate key. Please try again.");
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  }, [api_server_id, mutate]);

  const handleRegenerateKey = useCallback(async () => {
    if (!api_server_id) return;

    const confirmed = window.confirm(
      "Are you sure you want to regenerate the key? This will invalidate all existing keys and any API servers using the old key will lose access."
    );

    if (!confirmed) return;

    setIsRegenerating(true);
    setError(null);
    setGeneratedPrivateKey(null);

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
        setError(data.message || "Failed to regenerate key");
        return;
      }

      if (data.private_key) {
        setGeneratedPrivateKey(data.private_key);
      }

      mutate();
    } catch (e: unknown) {
      setError("Failed to regenerate key. Please try again.");
      console.error(e);
    } finally {
      setIsRegenerating(false);
    }
  }, [api_server_id, mutate]);

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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (!api_server_id) {
    return (
      <PageContainer>
        <div className="p-6">
          <p className="text-red-500">Invalid API server ID</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">JWKS Access Keys</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Manage JWKS access keys for API server: <code>{api_server_id}</code>
        </p>

        {keyError && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400">
              Failed to load key information. You may not have permission to
              manage this API server&apos;s keys.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {generatedPrivateKey && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
              Private Key Generated - Save This Now!
            </h3>
            <p className="text-yellow-700 dark:text-yellow-300 text-sm mb-4">
              This private key will only be shown once. Store it securely in
              your API server configuration. You will not be able to retrieve it
              again.
            </p>
            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs whitespace-pre-wrap break-all">
                {generatedPrivateKey}
              </pre>
              <button
                onClick={handleCopyKey}
                className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Current Key Status</h2>

          {!keyData && !keyError && (
            <p className="text-gray-500">Loading...</p>
          )}

          {keyData && !keyData.has_key && (
            <div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                No JWKS access key has been generated for this API server yet.
              </p>
              <button
                onClick={handleGenerateKey}
                disabled={isGenerating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium"
              >
                {isGenerating ? "Generating..." : "Generate Keys"}
              </button>
            </div>
          )}

          {keyData && keyData.has_key && keyData.key && (
            <div>
              <dl className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">
                    Key ID
                  </dt>
                  <dd className="font-mono text-sm">{keyData.key.key_id}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">
                    Created At
                  </dt>
                  <dd className="text-sm">
                    {formatDate(keyData.key.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">
                    Status
                  </dt>
                  <dd>
                    <span
                      className={`inline-flex px-2 py-1 text-xs rounded-full ${
                        keyData.key.is_active
                          ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                      }`}
                    >
                      {keyData.key.is_active ? "Active" : "Inactive"}
                    </span>
                  </dd>
                </div>
              </dl>

              <button
                onClick={handleRegenerateKey}
                disabled={isRegenerating}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white rounded-lg font-medium"
              >
                {isRegenerating ? "Regenerating..." : "Regenerate Keys"}
              </button>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Regenerating will invalidate the current key.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Usage Instructions</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            To authenticate requests to the JWKS endpoint, your API server needs
            to create a signed JWT assertion using the private key:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>
              Create a JWT with <code>sub</code> set to your API server ID
            </li>
            <li>
              Sign it using RS256 algorithm with your private key
            </li>
            <li>
              Send it as a Bearer token in the Authorization header when calling{" "}
              <code>/api/jwks/{"{audience}"}</code>
            </li>
          </ol>
        </div>
      </div>
    </PageContainer>
  );
}

export default JwksAccessKeysPageView;
