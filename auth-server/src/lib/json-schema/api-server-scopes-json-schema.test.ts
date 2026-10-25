import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import {
  API_SERVER_SCOPES_JSON_SCHEMA_PATH,
  MAX_API_SCOPES_PER_API_SERVER,
  MAX_API_SCOPE_VALUE_LENGTH,
  OIDC_RESERVED_SCOPES,
} from "@schemavaults/auth-common";
import { buildApiServerScopesJsonSchema } from "./api-server-scopes-json-schema";

const AUTH_SERVER_URL = "https://auth.example.com";
const schema = buildApiServerScopesJsonSchema(AUTH_SERVER_URL);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

const EXAMPLE_MANIFEST = {
  $schema: `${AUTH_SERVER_URL}${API_SERVER_SCOPES_JSON_SCHEMA_PATH}`,
  scopes: [
    { scope: "notes:read", description: "Read your notes." },
    { scope: "notes:write", description: "Create, edit and delete your notes.", allow_dynamic_clients: true },
  ],
};

function manifestWith(entry: Record<string, unknown>): unknown {
  return { scopes: [entry] };
}

describe("buildApiServerScopesJsonSchema", () => {
  test("is a valid draft 2020-12 schema", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(ajv.validateSchema(schema)).toBe(true);
  });

  test("names the deployment's own URL as its $id", () => {
    expect(schema.$id).toBe("https://auth.example.com/json-schema/api-server-scopes.json");
    expect(buildApiServerScopesJsonSchema("http://localhost:6767").$id).toBe(
      "http://localhost:6767/json-schema/api-server-scopes.json",
    );
  });

  test("accepts the example manifest, with or without $schema", () => {
    expect(validate(EXAMPLE_MANIFEST), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ scopes: EXAMPLE_MANIFEST.scopes })).toBe(true);
    expect(validate({ scopes: [] })).toBe(true);
    for (const example of (schema.examples as unknown[]) ?? []) {
      expect(validate(example)).toBe(true);
    }
  });

  test("refuses the OIDC scope names", () => {
    for (const scope of OIDC_RESERVED_SCOPES) {
      expect(validate(manifestWith({ scope, description: "Reserved." })), scope).toBe(false);
    }
  });

  test("refuses a value with a space and an over-long value", () => {
    expect(validate(manifestWith({ scope: "notes read", description: "Spaces." }))).toBe(false);
    expect(
      validate(manifestWith({ scope: "a".repeat(MAX_API_SCOPE_VALUE_LENGTH + 1), description: "Too long." })),
    ).toBe(false);
    expect(validate(manifestWith({ scope: "a".repeat(MAX_API_SCOPE_VALUE_LENGTH), description: "Longest." }))).toBe(
      true,
    );
  });

  test("refuses a missing, empty or over-long description", () => {
    expect(validate(manifestWith({ scope: "notes:read" }))).toBe(false);
    expect(validate(manifestWith({ scope: "notes:read", description: "" }))).toBe(false);
    expect(validate(manifestWith({ scope: "notes:read", description: "d".repeat(257) }))).toBe(false);
  });

  test("refuses unknown keys, a non-boolean allow_dynamic_clients and too many entries", () => {
    expect(validate(manifestWith({ scope: "notes:read", description: "Read.", extra: 1 }))).toBe(false);
    expect(validate(manifestWith({ scope: "notes:read", description: "Read.", allow_dynamic_clients: "yes" }))).toBe(
      false,
    );
    expect(validate({ scopes: [], prune: true })).toBe(false);
    expect(validate({})).toBe(false);
    const tooMany = Array.from({ length: MAX_API_SCOPES_PER_API_SERVER + 1 }, (_, index) => ({
      scope: `scope:${index}`,
      description: `Scope ${index}`,
    }));
    expect(validate({ scopes: tooMany })).toBe(false);
    expect(validate({ scopes: tooMany.slice(0, MAX_API_SCOPES_PER_API_SERVER) })).toBe(true);
  });

  test("carries editor help on every entry property", () => {
    const properties = schema.properties as {
      scopes: { items: { properties: Record<string, Record<string, unknown>> } };
    };
    const entry = properties.scopes.items.properties;
    for (const property of ["scope", "description", "allow_dynamic_clients"]) {
      expect(entry[property]?.title, property).toBeString();
      expect(entry[property]?.description, property).toBeString();
      expect(entry[property]?.examples, property).toBeArray();
    }
    expect(entry.allow_dynamic_clients?.description).toBe(
      "Whether dynamically registered clients may be granted this scope. Omit it to keep the current value; a new scope defaults to true.",
    );
  });
});
