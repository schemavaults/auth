import { describe, expect, test } from "bun:test";
import { PKCE_ProofKeyManager } from "@schemavaults/auth-common";
import {
  clearFlowAuthorizationRequest,
  clearSessionAuthorizationRequest,
  loadFlowAuthorizationRequest,
  loadSessionAuthorizationRequest,
  storeFlowAuthorizationRequest,
  storeSessionAuthorizationRequest,
} from "./sign-in-authorization-request-storage";

/** An in-memory Web Storage. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length(): number {
      return items.size;
    },
    clear: (): void => items.clear(),
    getItem: (key: string): string | null => items.get(key) ?? null,
    key: (index: number): string | null => [...items.keys()][index] ?? null,
    removeItem: (key: string): void => {
      items.delete(key);
    },
    setItem: (key: string, value: string): void => {
      items.set(key, value);
    },
  };
}

const NOTES = { scope: "openid notes:read", resource: "my-notes-api" } as const;

describe("sign-in authorization request storage", () => {
  test("keeps each flow's request under its challenge time", () => {
    const storage = memoryStorage();
    const now = Date.now();
    storeFlowAuthorizationRequest(storage, NOTES, now);
    storeFlowAuthorizationRequest(storage, { scope: "openid", resource: null }, now - 1);
    expect(loadFlowAuthorizationRequest(storage, now)).toEqual(NOTES);
    expect(loadFlowAuthorizationRequest(storage, now - 1)).toEqual({ scope: "openid", resource: null });
    clearFlowAuthorizationRequest(storage, now);
    expect(loadFlowAuthorizationRequest(storage, now)).toBeNull();
    expect(loadFlowAuthorizationRequest(storage, now - 1)).not.toBeNull();
  });

  test("drops abandoned flows' requests on the next write", () => {
    const storage = memoryStorage();
    const expired = Date.now() - PKCE_ProofKeyManager.max_age - 1000;
    storeFlowAuthorizationRequest(storage, NOTES, expired);
    storeFlowAuthorizationRequest(storage, NOTES, Date.now());
    expect(loadFlowAuthorizationRequest(storage, expired)).toBeNull();
  });

  test("ignores corrupt entries", () => {
    const storage = memoryStorage();
    storage.setItem("sign_in_authorization_requests", "{not json");
    expect(loadFlowAuthorizationRequest(storage, 1)).toBeNull();
    storage.setItem(
      "sign_in_authorization_requests",
      JSON.stringify({ "1": { scope: 5 }, "2": NOTES, x: NOTES }),
    );
    expect(loadFlowAuthorizationRequest(storage, 1)).toBeNull();
    expect(loadFlowAuthorizationRequest(storage, 2)).toEqual(NOTES);
    storage.setItem("session_authorization_request", "[]");
    expect(loadSessionAuthorizationRequest(storage)).toBeNull();
  });

  test("records and forgets the session's request", () => {
    const storage = memoryStorage();
    expect(loadSessionAuthorizationRequest(storage)).toBeNull();
    storeSessionAuthorizationRequest(storage, NOTES);
    expect(loadSessionAuthorizationRequest(storage)).toEqual(NOTES);
    clearSessionAuthorizationRequest(storage);
    expect(loadSessionAuthorizationRequest(storage)).toBeNull();
  });
});
