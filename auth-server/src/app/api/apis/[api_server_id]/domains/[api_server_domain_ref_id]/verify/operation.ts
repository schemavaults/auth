import { NextRequest } from "next/server";
import { isHardcodedApiServerId, type SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  VerifyApiServerDomainRequest,
  VerifyApiServerDomainResponse,
  apiServerDomainParams,
} from "@/lib/api/domain-schemas/apis";
import {
  ErrorResponse,
  RateLimitedResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { verifyApiServerDomain } from "@/lib/api-server-domain-verification";
import captureServerException from "@/lib/captureServerException";
import { canUserManageResource } from "@/lib/ownership/resource-access";
import {
  API_SERVER_DOMAIN_VERIFICATION_RATE_LIMIT,
  checkRateLimit,
  extractClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";

const ROUTE = "/api/apis/{api_server_id}/domains/{api_server_domain_ref_id}/verify";

export const verifyApiServerDomainOperation = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Verify the ownership of an API server's domain",
  description:
    "Checks that whoever registered the domain controls it, so nobody can claim another tenant's origin by registering it. Verified domains take precedence: when one of them matches a resource URL, other API servers' unverified registrations are ignored. Unverified registrations only resolve as a fallback while the `require_api_server_domain_verification` server setting is off (the default during the transition to domain verification); once it is on, they never resolve. Every registration starts unverified with its own token; `GET /api/apis/{api_server_id}/domains` lists the TXT record to publish for it: `_<app id>-domain-verification.<host>` with the value `<app id>-domain-verification=<token>`, where `<app id>` is this auth server deployment's own app id (e.g. `_schemavaults-auth-domain-verification.api.example.com` = `schemavaults-auth-domain-verification=<token>`). With `method: \"dns_txt\"` (the default) the auth server looks the record up: found, the domain is verified (200); not published, it is not (422 `verification_record_not_found`). Keep the record published: every check of a host also re-checks the host's other DNS-verified registrations (of any API server) and returns those whose record is gone to unverified, which is how a domain's new owner takes it over from a previous owner. Hosts DNS cannot verify (loopback and IP-literal hosts, single-label names) answer 422 `domain_not_dns_verifiable`; a platform administrator can attest any domain with `method: \"administrator\"`. Rate limited per account and client IP.",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes:
      "Organization owners/admins of the owning organization, the owning user of a user-owned API server, or platform administrators. `method: \"administrator\"`: platform administrators only.",
  }),
  request: {
    params: apiServerDomainParams,
    body: {
      required: false,
      lenientContentType: true,
      schema: VerifyApiServerDomainRequest,
      description: "Optional; defaults to `{ \"method\": \"dns_txt\" }`.",
    },
  },
  responses: {
    200: { description: "The domain is verified", schema: VerifyApiServerDomainResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: {
      description: "No such API server, or no domain with the given id for this API server",
      schema: ErrorResponse,
    },
    409: {
      description:
        "`registration_changed`: the domain registration kept changing while it was being verified (removed, or verified or revoked concurrently); nothing was verified. Retry.",
      schema: ErrorResponse,
    },
    422: {
      description:
        "The domain is not verified: its TXT record is not published (`verification_record_not_found`), or its host cannot be verified through DNS (`domain_not_dns_verifiable`). `verification` is the domain's current state.",
      schema: VerifyApiServerDomainResponse,
    },
    429: { description: "Too many verification attempts", schema: RateLimitedResponse },
    500: { description: "Failed to verify the domain", schema: ErrorResponse },
    503: {
      description:
        "DNS gave no authoritative answer (`dns_lookup_failed`: timeout, SERVFAIL, ...); nothing changed. Retry later.",
      schema: VerifyApiServerDomainResponse,
    },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, redis } = ctx.context;
    const { api_server_id, api_server_domain_ref_id } = ctx.params;
    const method = ctx.body?.method ?? "dns_txt";

    if (isHardcodedApiServerId(api_server_id)) {
      return ctx.json(403, {
        success: false,
        message: "The domains of hardcoded API servers come from the server's configuration and cannot be verified",
      });
    }

    let apiServer: SchemaVaultsApiServerDefinition | null;
    try {
      apiServer = await new SchemaVaultsApiServerRegistry(db).getApiServer(api_server_id);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_verify_api_server_domain.getApiServer",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load API server" });
    }
    if (!apiServer) {
      return ctx.json(404, { success: false, message: "API server not found" });
    }

    // Same gate as adding or removing a domain: the API server's managers.
    let authorized: boolean = user.admin === true;
    if (!authorized) {
      try {
        authorized = await canUserManageResource(db, user, apiServer);
      } catch (e: unknown) {
        await captureServerException(db, e, {
          op_name: "POST_verify_api_server_domain.canUserManageResource",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id, nonFatal: true },
        });
      }
    }
    if (!authorized) {
      return ctx.json(403, {
        success: false,
        message: "You must be an admin or organization owner to verify a domain of an API server",
      });
    }
    if (method === "administrator" && user.admin !== true) {
      return ctx.json(403, {
        success: false,
        message: "Only platform administrators can verify a domain without DNS",
      });
    }

    // Each DNS check queries a name the caller chose.
    const ip = extractClientIp(new NextRequest(ctx.url, { headers: ctx.request.headers }));
    const rate = await checkRateLimit(redis.client, API_SERVER_DOMAIN_VERIFICATION_RATE_LIMIT, {
      ...(ip ? { ip } : {}),
      uid: user.uid,
    });
    if (!rate.allowed) return rateLimitResponse(rate);

    try {
      const outcome = await verifyApiServerDomain(db, {
        api_server_id,
        api_server_domain_ref_id,
        method,
      });
      switch (outcome.kind) {
        case "not_found":
          return ctx.json(404, {
            success: false,
            message: "No domain found with the given id for this API server",
          });
        case "changed":
          return ctx.json(409, {
            success: false,
            error: "registration_changed",
            message: "The domain registration changed while it was being verified. Try again.",
          });
        case "verified":
          return ctx.json(200, {
            success: true,
            message: "The domain is verified",
            verification: outcome.verification,
          });
        case "record_not_found":
          return ctx.json(422, {
            success: false,
            error: "verification_record_not_found",
            message: outcome.verification.dns_txt_record
              ? `No TXT record '${outcome.verification.dns_txt_record.name}' with the value '${outcome.verification.dns_txt_record.value}' is published. DNS changes can take a while to propagate; try again later.`
              : "The domain's TXT record is not published.",
            verification: outcome.verification,
          });
        case "not_dns_verifiable":
          return ctx.json(422, {
            success: false,
            error: "domain_not_dns_verifiable",
            message:
              "This domain's host cannot be verified through DNS (loopback and IP-literal hosts, single-label names). Ask a platform administrator to verify it.",
            verification: outcome.verification,
          });
        case "lookup_failed":
          await captureServerException(db, new Error(`TXT lookup failed: ${outcome.code}`), {
            op_name: "POST_verify_api_server_domain.lookupTxtRecords",
            route: ROUTE,
            uid: user.uid,
            context: { api_server_id, api_server_domain_ref_id, code: outcome.code, nonFatal: true },
          });
          return ctx.json(503, {
            success: false,
            error: "dns_lookup_failed",
            message: "DNS gave no answer for the domain's TXT record. Try again later.",
            verification: outcome.verification,
          });
      }
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_verify_api_server_domain.verifyApiServerDomain",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id, api_server_domain_ref_id, method },
      });
      return ctx.json(500, { success: false, message: "Failed to verify the domain" });
    }
  },
});
