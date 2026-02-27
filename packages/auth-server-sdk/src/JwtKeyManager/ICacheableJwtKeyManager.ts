import type { IJwtKeyManager } from "./IJwtKeyManager";

export interface ICacheableJwtKeyManager extends IJwtKeyManager {
  invalidateJwksCache(audienceId: string): void;
}

export function isCacheableJwtKeyManager(
  manager: IJwtKeyManager,
): manager is ICacheableJwtKeyManager {
  return (
    "invalidateJwksCache" in manager &&
    typeof manager.invalidateJwksCache === "function"
  );
}
