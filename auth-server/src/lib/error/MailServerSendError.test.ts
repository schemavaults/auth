import { describe, expect, test } from "bun:test";
import {
  MailServerSendError,
  describeMailServerSendFailure,
  parseMailServerErrorEnvelope,
} from "./MailServerSendError";

const ENDPOINT = "https://mail.example.test/api/send";

describe("parseMailServerErrorEnvelope", () => {
  test("reads the OperationError envelope", () => {
    expect(
      parseMailServerErrorEnvelope({
        success: false,
        error: "token_revoked",
        message: "Access token has been revoked",
      }),
    ).toEqual({ code: "token_revoked", message: "Access token has been revoked" });
  });

  test("tolerates a body that is not an envelope", () => {
    expect(parseMailServerErrorEnvelope(null)).toEqual({ code: null, message: null });
    expect(parseMailServerErrorEnvelope("Unauthorized")).toEqual({ code: null, message: null });
    expect(parseMailServerErrorEnvelope({ error: 401, message: "" })).toEqual({
      code: null,
      message: null,
    });
  });
});

describe("describeMailServerSendFailure", () => {
  test("keeps the historical prefix and appends the mail server's code and message", () => {
    expect(
      describeMailServerSendFailure({
        status: 401,
        statusText: "Unauthorized",
        envelope: { code: "token_revoked", message: "Access token has been revoked" },
      }),
    ).toBe(
      "Failed to send email via mail server /api/send endpoint: 401 Unauthorized (token_revoked: Access token has been revoked)",
    );
  });

  test("appends whichever of code and message the body carried", () => {
    expect(
      describeMailServerSendFailure({
        status: 403,
        statusText: "Forbidden",
        envelope: { code: "forbidden", message: null },
      }),
    ).toBe("Failed to send email via mail server /api/send endpoint: 403 Forbidden (forbidden)");
    expect(
      describeMailServerSendFailure({
        status: 502,
        statusText: "",
        envelope: { code: null, message: null },
      }),
    ).toBe("Failed to send email via mail server /api/send endpoint: 502");
  });
});

describe("MailServerSendError", () => {
  test("carries the status and the mail server's envelope", () => {
    const error = new MailServerSendError({
      endpoint: ENDPOINT,
      status: 401,
      statusText: "Unauthorized",
      envelope: { code: "token_revoked", message: "Access token has been revoked" },
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MailServerSendError");
    expect(error.endpoint).toBe(ENDPOINT);
    expect(error.status).toBe(401);
    expect(error.code).toBe("token_revoked");
    expect(error.mailServerMessage).toBe("Access token has been revoked");
    expect(error.message).toContain("401 Unauthorized (token_revoked:");
  });
});
