import { describe, expect, test } from "bun:test";
import { parseBasicClientCredentials } from "./authenticate-token-endpoint-client";

function basicHeader(client_id: string, client_secret: string): string {
  const encoded = Buffer.from(
    `${encodeURIComponent(client_id)}:${encodeURIComponent(client_secret)}`,
    "utf8",
  ).toString("base64");
  return `Basic ${encoded}`;
}

describe("parseBasicClientCredentials", () => {
  test("parses RFC 6749 §2.3.1 Basic credentials", () => {
    const parsed = parseBasicClientCredentials(
      basicHeader("my-app", "svs_secret-value"),
    );
    expect(parsed).toEqual({
      client_id: "my-app",
      client_secret: "svs_secret-value",
    });
  });

  test("form-urldecodes the credential components", () => {
    const parsed = parseBasicClientCredentials(
      basicHeader("app with space", "p@ss:word%"),
    );
    expect(parsed).toEqual({
      client_id: "app with space",
      client_secret: "p@ss:word%",
    });
  });

  test("returns null for absent headers and other schemes", () => {
    expect(parseBasicClientCredentials(null)).toBeNull();
    expect(parseBasicClientCredentials("Bearer some-token")).toBeNull();
    expect(parseBasicClientCredentials("")).toBeNull();
  });

  test("returns 'malformed' for undecodable Basic headers", () => {
    // No colon separator once decoded
    const noColon = `Basic ${Buffer.from("just-a-client-id", "utf8").toString("base64")}`;
    expect(parseBasicClientCredentials(noColon)).toBe("malformed");

    // Empty client_id
    const emptyId = `Basic ${Buffer.from(":secret", "utf8").toString("base64")}`;
    expect(parseBasicClientCredentials(emptyId)).toBe("malformed");

    // Invalid percent-encoding
    const badEncoding = `Basic ${Buffer.from("client%zz:secret", "utf8").toString("base64")}`;
    expect(parseBasicClientCredentials(badEncoding)).toBe("malformed");
  });

  test("allows an empty client secret only via explicit empty password", () => {
    const parsed = parseBasicClientCredentials(basicHeader("my-app", ""));
    expect(parsed).toEqual({ client_id: "my-app", client_secret: "" });
  });
});
