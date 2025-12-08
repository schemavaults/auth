import type { JWKS } from "@schemavaults/jwt";

export interface IJwtKeyManager {
  loadJwks(): Promise<JWKS>;
}
