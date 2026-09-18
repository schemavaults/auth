describe("Unauthenticated API Requests", () => {
  const fakeAppId = "00000000-0000-0000-0000-000000000001";
  const fakeApiId = "00000000-0000-0000-0000-000000000002";
  const fakeOrgId = "00000000-0000-0000-0000-000000000003";
  const fakeUid = "00000000-0000-0000-0000-000000000004";
  const fakeInvitationId = "00000000-0000-0000-0000-000000000005";
  const fakeErrorId = "00000000-0000-0000-0000-000000000006";
  const fakeCallbackUrlRefId = "00000000-0000-0000-0000-000000000007";
  const fakeFactorId = "00000000-0000-0000-0000-000000000008";
  const fakeInviteCode = "unauthenticated-probe-code";

  describe("Authenticated API routes", () => {
    it("GET /api/auth/whoami/:appId returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/auth/whoami/${fakeAppId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/auth/session/generate-authorization-code returns 401", () => {
      cy.request({
        method: "POST",
        url: "/api/auth/session/generate-authorization-code",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apis returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/apis",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/apis returns 401", () => {
      cy.request({
        method: "POST",
        url: "/api/apis",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apis/:apiId/jwks-access-key returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/apis/${fakeApiId}/jwks-access-key`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/apis/:apiId/jwks-access-key returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/apis/${fakeApiId}/jwks-access-key`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("PUT /api/apis/:apiId/jwks-access-key returns 401", () => {
      cy.request({
        method: "PUT",
        url: `/api/apis/${fakeApiId}/jwks-access-key`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apis/:apiId/domains returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/apis/${fakeApiId}/domains`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/apis/:apiId/domains returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/apis/${fakeApiId}/domains`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/apis/:apiId/connect_app/:appId returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/apis/${fakeApiId}/connect_app/${fakeAppId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apis/:apiId/connect_app/:appId returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/apis/${fakeApiId}/connect_app/${fakeAppId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/apis/:apiId/connect_app/:appId returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/apis/${fakeApiId}/connect_app/${fakeAppId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/apis/:apiId/connect_app/:appId with invalid IDs returns 401", () => {
      // Auth must be enforced before input validation so that unauthenticated
      // callers can't probe parameter handling. 401 must beat 400.
      cy.request({
        method: "DELETE",
        url: "/api/apis/not-a-uuid/connect_app/also-not-a-uuid",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apps returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/apps",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/apps returns 401", () => {
      cy.request({
        method: "POST",
        url: "/api/apps",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/apps/:appId/authorize returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/apps/${fakeAppId}/authorize`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apps/:appId/check-authorization returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/apps/${fakeAppId}/check-authorization`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apps/:appId/domains returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/apps/${fakeAppId}/domains`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/apps/:appId/domains returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/apps/${fakeAppId}/domains`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apps/:appId returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/apps/${fakeAppId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/apps/:appId returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/apps/${fakeAppId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apis/:apiId returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/apis/${fakeApiId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/apis/:apiId returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/apis/${fakeApiId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/me/invitations returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/me/invitations",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/user/organizations returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/user/organizations",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/me/organizations returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/me/organizations",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/me/organizations/:orgId/role returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/me/organizations/${fakeOrgId}/role`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/organizations/:orgId returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/organizations/${fakeOrgId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/organizations/:orgId/members returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/organizations/${fakeOrgId}/members`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("PATCH /api/organizations/:orgId/members/:uid/role returns 401", () => {
      cy.request({
        method: "PATCH",
        url: `/api/organizations/${fakeOrgId}/members/${fakeUid}/role`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/organizations/:orgId/members/:uid/role returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/organizations/${fakeOrgId}/members/${fakeUid}/role`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/organizations/:orgId/invitations returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/organizations/${fakeOrgId}/invitations`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/organizations/:orgId/invitations returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/organizations/${fakeOrgId}/invitations`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("PATCH /api/organizations/:orgId/invitations/:invitationId returns 401", () => {
      cy.request({
        method: "PATCH",
        url: `/api/organizations/${fakeOrgId}/invitations/${fakeInvitationId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/organizations/:orgId/invitations/:invitationId returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/organizations/${fakeOrgId}/invitations/${fakeInvitationId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });
  });

  describe("Admin API routes", () => {
    it("GET /api/admin/invite-codes returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/admin/invite-codes",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/admin/invite-codes returns 401", () => {
      cy.request({
        method: "POST",
        url: "/api/admin/invite-codes",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/admin/promote/:uid returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/admin/promote/${fakeUid}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/admin/settings returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/admin/settings",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("PATCH /api/admin/settings/:key returns 401", () => {
      cy.request({
        method: "PATCH",
        url: `/api/admin/settings/fake-key`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/admin/users/list returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/admin/users/list",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/admin/users/:uid/mfa returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/admin/users/${fakeUid}/mfa`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/admin/users/:uid returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/admin/users/${fakeUid}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/admin/users/:uid with invalid uid returns 401", () => {
      // Auth must be enforced before input validation so that unauthenticated
      // callers can't probe parameter handling. 401 must beat 400.
      cy.request({
        method: "DELETE",
        url: "/api/admin/users/not-a-uuid",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/organizations returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/organizations",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/organizations returns 401", () => {
      cy.request({
        method: "POST",
        url: "/api/organizations",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/admin/server-traces returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/admin/server-traces",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/admin/send-daily-report returns 401", () => {
      cy.request({
        method: "GET",
        url: "/api/admin/send-daily-report",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/admin/send-daily-report returns 401", () => {
      cy.request({
        method: "POST",
        url: "/api/admin/send-daily-report",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/admin/errors returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/admin/errors?before=${encodeURIComponent(
          new Date().toISOString(),
        )}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/admin/errors without 'before' param returns 401", () => {
      // Auth must be enforced before input validation so that unauthenticated
      // callers can't probe parameter handling. 401 must beat 400.
      cy.request({
        method: "DELETE",
        url: "/api/admin/errors",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/admin/errors/:errorId returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/admin/errors/${fakeErrorId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });
  });

  // App configuration management routes and the user profile route parse
  // their path parameters inside the authenticated guard, so a well-formed
  // id still yields a 401 before any lookup.
  describe("App configuration + profile API routes", () => {
    it("GET /api/user/profile returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/user/profile`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("PUT /api/user/profile returns 401", () => {
      cy.request({
        method: "PUT",
        url: `/api/user/profile`,
        body: { display_name: "should-not-be-saved" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apps/:appId/callback-urls returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/apps/${fakeAppId}/callback-urls`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/apps/:appId/callback-urls returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/apps/${fakeAppId}/callback-urls`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/apps/:appId/callback-urls/:refId returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/apps/${fakeAppId}/callback-urls/${fakeCallbackUrlRefId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/apps/:appId/client-secret returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/apps/${fakeAppId}/client-secret`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/apps/:appId/client-secret returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/apps/${fakeAppId}/client-secret`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("PUT /api/apps/:appId/client-secret returns 401", () => {
      cy.request({
        method: "PUT",
        url: `/api/apps/${fakeAppId}/client-secret`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/apps/:appId/client-secret returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/apps/${fakeAppId}/client-secret`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });
  });

  // Every /api/user/mfa/* route is session-guarded; none of them may leak
  // enrollment state (or accept an enrollment step) without a session.
  describe("User MFA API routes", () => {
    it("GET /api/user/mfa/status returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/user/mfa/status`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/user/mfa/status/totp returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/user/mfa/status/totp`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/user/mfa/totp/enroll returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/user/mfa/totp/enroll`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/user/mfa/totp/verify-enrollment returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/user/mfa/totp/verify-enrollment`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/user/mfa/totp/:factorId returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/user/mfa/totp/${fakeFactorId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/user/mfa/webauthn returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/user/mfa/webauthn`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/user/mfa/webauthn/options returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/user/mfa/webauthn/options`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/user/mfa/webauthn/verify-enrollment returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/user/mfa/webauthn/verify-enrollment`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/user/mfa/webauthn/authenticate-options returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/user/mfa/webauthn/authenticate-options`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/user/mfa/webauthn/:factorId returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/user/mfa/webauthn/${fakeFactorId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/user/mfa/recovery-codes/regenerate returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/user/mfa/recovery-codes/regenerate`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });
  });

  // Admin routes that were previously missing from this table. Note that
  // users/:uid/disable, users/:uid/resend-verification and users/:uid/tokens
  // parse their route/query parameters BEFORE the admin guard, so a
  // well-formed uid is used here to reach the guard's 401.
  describe("Additional admin API routes", () => {
    it("GET /api/admin/branding returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/admin/branding`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("PUT /api/admin/branding/:asset returns 401", () => {
      cy.request({
        method: "PUT",
        url: `/api/admin/branding/favicon`,
        headers: { "content-type": "image/png" },
        body: "not-really-a-png",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/admin/branding/:asset returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/admin/branding/favicon`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/admin/invite-codes/:inviteCode/usages returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/admin/invite-codes/${fakeInviteCode}/usages`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/admin/users/:uid/disable returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/admin/users/${fakeUid}/disable`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/admin/users/:uid/disable returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/admin/users/${fakeUid}/disable`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("DELETE /api/admin/users/:uid/mfa returns 401", () => {
      cy.request({
        method: "DELETE",
        url: `/api/admin/users/${fakeUid}/mfa`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("POST /api/admin/users/:uid/resend-verification returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/admin/users/${fakeUid}/resend-verification`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/admin/users/:uid/tokens returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/admin/users/${fakeUid}/tokens`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it("GET /api/admin/users/:uid/tokens with token_type filter returns 401", () => {
      cy.request({
        method: "GET",
        url: `/api/admin/users/${fakeUid}/tokens?token_type=refresh`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });
  });
});
