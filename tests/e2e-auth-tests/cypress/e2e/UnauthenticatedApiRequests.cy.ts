describe("Unauthenticated API Requests", () => {
  const fakeAppId = crypto.randomUUID();
  const fakeApiId = crypto.randomUUID();
  const fakeOrgId = crypto.randomUUID();
  const fakeUid = crypto.randomUUID();
  const fakeInvitationId = crypto.randomUUID();

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

    it("POST /api/apis/:apiId/connect_app/:appId returns 401", () => {
      cy.request({
        method: "POST",
        url: `/api/apis/${fakeApiId}/connect_app/${fakeAppId}`,
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
  });
});
