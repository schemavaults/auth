"use client";

import { useCallback } from "react";
import type {
  MfaStatusResponse,
  MfaEnrollResponse,
  MfaVerifyEnrollmentResponse,
  AuthenticateResult,
  MfaProof,
  WebauthnEnrollOptionsResponse,
  WebauthnAuthenticationOptionsResponse,
  WebauthnRegistrationResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { useSWRConfig } from "swr";
import useAuth from "@/hooks/use-auth";
import { useMfaStatusSwr } from "./use-mfa-status-swr";
import { MFA_STATUS_SWR_KEY_PREFIX } from "./use-mfa-factor-status-swr";

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
    factor_id: string,
    code: string,
  ) => Promise<MfaVerifyEnrollmentResponse>;
  submitChallenge: (
    challenge_id: string,
    client_app_id: string,
    proof: MfaProof,
  ) => Promise<AuthenticateResult>;
  beginWebauthnEnrollment: () => Promise<WebauthnEnrollOptionsResponse>;
  confirmWebauthnEnrollment: (
    factor_id: string,
    attestation: WebauthnRegistrationResponse,
    label?: string,
  ) => Promise<MfaVerifyEnrollmentResponse>;
  removeWebauthnFactor: (factor_id: string, proof: MfaProof) => Promise<void>;
  getWebauthnStepUpOptions: () => Promise<WebauthnAuthenticationOptionsResponse>;
  getWebauthnAuthenticationOptions: (
    challenge_id: string,
    client_app_id: string,
  ) => Promise<WebauthnAuthenticationOptionsResponse>;
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
  const { mutate: globalMutate } = useSWRConfig();

  // Revalidate the aggregate status AND every per-factor-type status
  // (e.g. /api/user/mfa/status/totp) so all MFA hooks reflect a mutation.
  const refreshAllMfaStatus = useCallback(async () => {
    await globalMutate(
      (key) =>
        typeof key === "string" && key.startsWith(MFA_STATUS_SWR_KEY_PREFIX),
    );
  }, [globalMutate]);

  const enrollTotp = useCallback(async () => {
    const client = requireClient(auth);
    const result = await client.enrollTotp();
    return result;
  }, [auth]);

  const confirmTotpEnrollment = useCallback(
    async (factor_id: string, code: string) => {
      const client = requireClient(auth);
      const result = await client.confirmTotpEnrollment(factor_id, code);
      await refreshAllMfaStatus();
      return result;
    },
    [auth, refreshAllMfaStatus],
  );

  const removeFactor = useCallback(
    async (factor_id: string, code: string) => {
      const client = requireClient(auth);
      await client.removeFactor(factor_id, code);
      await refreshAllMfaStatus();
    },
    [auth, refreshAllMfaStatus],
  );

  const regenerateRecoveryCodes = useCallback(
    async (factor_id: string, code: string) => {
      const client = requireClient(auth);
      const result = await client.regenerateRecoveryCodes(factor_id, code);
      await refreshAllMfaStatus();
      return result;
    },
    [auth, refreshAllMfaStatus],
  );

  const submitChallenge = useCallback(
    async (challenge_id: string, client_app_id: string, proof: MfaProof) => {
      const client = requireClient(auth);
      return await client.verifyMfaChallenge(challenge_id, client_app_id, proof);
    },
    [auth],
  );

  const beginWebauthnEnrollment = useCallback(async () => {
    const client = requireClient(auth);
    return await client.beginWebauthnEnrollment();
  }, [auth]);

  const confirmWebauthnEnrollment = useCallback(
    async (
      factor_id: string,
      attestation: WebauthnRegistrationResponse,
      label?: string,
    ) => {
      const client = requireClient(auth);
      const result = await client.confirmWebauthnEnrollment(
        factor_id,
        attestation,
        label,
      );
      await refreshAllMfaStatus();
      return result;
    },
    [auth, refreshAllMfaStatus],
  );

  const removeWebauthnFactor = useCallback(
    async (factor_id: string, proof: MfaProof) => {
      const client = requireClient(auth);
      await client.removeWebauthnFactor(factor_id, proof);
      await refreshAllMfaStatus();
    },
    [auth, refreshAllMfaStatus],
  );

  const getWebauthnStepUpOptions = useCallback(async () => {
    const client = requireClient(auth);
    return await client.getWebauthnStepUpOptions();
  }, [auth]);

  const getWebauthnAuthenticationOptions = useCallback(
    async (challenge_id: string, client_app_id: string) => {
      const client = requireClient(auth);
      return await client.getWebauthnAuthenticationOptions(
        challenge_id,
        client_app_id,
      );
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
    beginWebauthnEnrollment,
    confirmWebauthnEnrollment,
    removeWebauthnFactor,
    getWebauthnStepUpOptions,
    getWebauthnAuthenticationOptions,
  };
}
