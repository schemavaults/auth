import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export async function removeFactor(args: {
  adapter: ISchemaVaultsAuthClientAdapter;
  factor_id: string;
  code: string;
}): Promise<void> {
  const response = await args.adapter.fetch(
    `/api/user/mfa/totp/${encodeURIComponent(args.factor_id)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: args.code }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to remove MFA factor (status ${response.status})`);
  }
}
