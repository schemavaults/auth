import {
  mfaEnrollResponseSchema,
  type MfaEnrollResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export async function enrollTotp(
  adapter: ISchemaVaultsAuthClientAdapter,
): Promise<MfaEnrollResponse> {
  const response = await adapter.fetch(`/api/user/mfa/totp/enroll`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const body = await safeReadJsonMessage(response);
    throw new Error(body ?? `Failed to enroll TOTP (status ${response.status})`);
  }
  const json: unknown = await response.json();
  const result = mfaEnrollResponseSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Unexpected enrollTotp response: ${result.error.message}`);
  }
  return result.data;
}

async function safeReadJsonMessage(
  response: Response,
): Promise<string | null> {
  try {
    const json: unknown = await response.json();
    if (
      typeof json === "object" &&
      json !== null &&
      "message" in json &&
      typeof (json as { message: unknown }).message === "string"
    ) {
      return (json as { message: string }).message;
    }
  } catch {
    /* fallthrough */
  }
  return null;
}
