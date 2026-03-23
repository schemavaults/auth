import type { JWKS } from "@schemavaults/jwt";

export interface IJwtKeyManager {
  loadJwks(audienceId: string): Promise<JWKS>;
  isConfigured(): boolean;
}
