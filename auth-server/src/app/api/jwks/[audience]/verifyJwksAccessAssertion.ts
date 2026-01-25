import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import type { Kysely } from "@schemavaults/dbh";
import { jwtVerify, importSPKI } from "@schemavaults/jwt";

export default async function verifyJwksAccessAssertion(
  assertion: string,
  audience: string,
  db: Kysely<AuthDatabase>
): Promise<boolean> {
  const accessKeysRegistry = new JwksAccessKeysRegistry(db);
  const activeKey = await accessKeysRegistry.getActiveKeyForAudience(audience);

  if (!activeKey) {
    console.warn(`No active JWKS access key found for audience "${audience}"`);
    return false;
  }

  try {
    const publicKey = await importSPKI(activeKey.public_key, "RS256");
    const { payload } = await jwtVerify(assertion, publicKey, {
      algorithms: ["RS256"],
    });

    // Verify the assertion is for this specific audience
    if (payload.sub !== audience) {
      console.warn(`Assertion subject "${payload.sub}" does not match audience "${audience}"`);
      return false;
    }

    return true;
  } catch (e: unknown) {
    console.error("Failed to verify JWKS access assertion:", e);
    return false;
  }
}
