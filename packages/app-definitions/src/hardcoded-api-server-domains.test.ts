import { describe, expect, test } from "bun:test";
import { HARDCODED_CORE_SCHEMAVAULTS_API_SERVER_DOMAINS } from "./hardcoded-core-schemavaults-api-server-domains";

describe("Hardcoded API Server Domains", () => {
  test("Each hardcoded API server domain has a unique ID", () => {
    const uuidSet = new Set();
    let errorThrown: boolean = false;
    try {
      // Throw an error if any of the domain ref IDs are not unique
      [...HARDCODED_CORE_SCHEMAVAULTS_API_SERVER_DOMAINS].forEach((domain) => {
        if (uuidSet.has(domain.api_server_domain_ref_id)) {
          throw new Error(
            `Duplicate UUID found: ${domain.api_server_domain_ref_id}`,
          );
        }
        uuidSet.add(domain.api_server_domain_ref_id);
      });
    } catch (e: unknown) {
      console.error("Non-unique hardcoded API server domain ID found: ", e);
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });
});
