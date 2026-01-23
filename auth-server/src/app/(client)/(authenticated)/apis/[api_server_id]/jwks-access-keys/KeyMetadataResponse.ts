import type { JwksAccessKeyStatusQueryResponse } from "@/lib/auth-db/jwks-access-keys";

export interface SuccessKeyMetadataResponse {
  success: true;
  key_metadata: JwksAccessKeyStatusQueryResponse | false;
}

export type KeyMetadataResponse = SuccessKeyMetadataResponse | { success: false };
