"use client";

import { useCallback } from "react";
import type {
  MfaStatusResponse,
  MfaEnrollResponse,
  MfaVerifyEnrollmentResponse,
  AuthenticateResult,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useAuth from "@/hooks/use-auth";
import { useMfaStatusSwr } from "./use-mfa-status-swr";

export interface UseMfaResult {
  status: MfaStatusResponse | null;
  isLoading: boolean;
  refresh: () => Promise<MfaStatusResponse | null | undefined>;
  enrollTotp: () => Promise<MfaEnrollResponse>;
  confirmTotpEnrollment: (
    factor_id: string,
    code: string,
  ) => Promise<MfaVerifyEnrollmentResponse>;
  removeFactor: (factor_id: string, code: string) => Promise<void>;
  regenerateRecoveryCodes: (
    code: string,
  ) => Promise<MfaVerifyEnrollmentResponse>;
  submitChallenge: (
    challenge_id: string,
    client_app_id: string,
    proof:
      | { type: "totp"; code: string }
      | { type: "recovery_code"; recovery_code: string },
  ) => Promise<AuthenticateResult>;
}

function requireClient(
  auth: ReturnType<typeof useAuth>,
): ISchemaVaultsAuthClient {
  if (!auth.ready) {
    throw new Error("Auth client is not ready yet.");
  }
  const client = auth.client.current;
  if (!client) {
    throw new Error("Auth client is not available.");
  }
  return client;
}

/**
 * Read + mutate the current user's MFA enrollment. Mutators automatically
 * trigger an SWR revalidation so the surrounding UI reflects the new
 * status without a manual refresh.
 */
export function useMfa(): UseMfaResult {
  const auth = useAuth();
  const { data, isLoading, refresh } = useMfaStatusSwr();

  const enrollTotp = useCallback(async () => {
    const client = requireClient(auth);
    const result = await client.enrollTotp();
    return result;
  }, [auth]);

  const confirmTotpEnrollment = useCallback(
    async (factor_id: string, code: string) => {
      const client = requireClient(auth);
      const result = await client.confirmTotpEnrollment(factor_id, code);
      await refresh();
      return result;
    },
    [auth, refresh],
  );

  const removeFactor = useCallback(
    async (factor_id: string, code: string) => {
      const client = requireClient(auth);
      await client.removeFactor(factor_id, code);
      await refresh();
    },
    [auth, refresh],
  );

  const regenerateRecoveryCodes = useCallback(
    async (code: string) => {
      const client = requireClient(auth);
      const result = await client.regenerateRecoveryCodes(code);
      await refresh();
      return result;
    },
    [auth, refresh],
  );

  const submitChallenge = useCallback(
    async (
      challenge_id: string,
      client_app_id: string,
      proof:
        | { type: "totp"; code: string }
        | { type: "recovery_code"; recovery_code: string },
    ) => {
      const client = requireClient(auth);
      return await client.verifyMfaChallenge(challenge_id, client_app_id, proof);
    },
    [auth],
  );

  return {
    status: data,
    isLoading,
    refresh,
    enrollTotp,
    confirmTotpEnrollment,
    removeFactor,
    regenerateRecoveryCodes,
    submitChallenge,
  };
}
