import isServer from "@/lib/isServerRuntime";

export type UuidGenerator = () => string;

export async function loadUuidGenerator(): Promise<UuidGenerator> {
  if (isServer()) {
    return await import("./uuid.server").then(mod => mod.default);
  }

  if (window.isSecureContext) {
    return await import("./uuid.securecontext").then(mod => mod.default);
  } else {
    return await import("./uuid.insecurecontext").then(mod => mod.default);
  }
}

export { uuidSync as uuid } from './uuidSync';
