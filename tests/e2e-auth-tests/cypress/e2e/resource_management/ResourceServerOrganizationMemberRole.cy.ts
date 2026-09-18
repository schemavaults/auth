// Covers GET /api/resource-server/organizations/[organization_id]/members/[uid]/role,
// the bearer-authenticated endpoint behind @schemavaults/auth-server-sdk's
// isUserInOrganization(). It had no E2E coverage. A resource server proves
// its identity with a single-use JWKS access assertion plus an
// `X-Api-Server-Id` header, and may only query organizations that own it.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

interface MemberRoleResponseBody {
  success: boolean;
  error?: string;
  data?: { organization_id: string; uid: string; role: string | null };
}

interface WhoamiResponseBody {
  success: boolean;
  user?: { uid: string };
}

interface CreateInvitationResponseBody {
  success: boolean;
  data?: { invitation: { invitation_id: string } };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const UNKNOWN_UID = "00000000-0000-0000-0000-000000000099";

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

function mintAssertion(
  api_server_id: string,
  private_key_pem: string,
): Cypress.Chainable<string> {
  return cy
    .task("createJwksAccessProofToken", { api_server_id, private_key_pem })
    .then((token) => {
      if (typeof token !== "string") {
        throw new TypeError("Expected createJwksAccessProofToken to yield a string");
      }
      return token;
    });
}

interface Fixture {
  organization_id: string;
  api_server_id: string;
  private_key: string;
  owner_uid: string;
  member_uid: string;
}

/**
 * Superuser creates an organization (becoming its owner) and an API server
 * owned by that organization with a JWKS access key; a fresh regular user is
 * invited by uid and accepts, becoming a plain member.
 */
function setup(): Cypress.Chainable<Fixture> {
  const organization_id = randomId("e2e-rsrole");
  const api_server_id = randomId("e2e-rsrole-api");

  return cy.generate_random_test_user_credentials().then((memberCredentials) => {
    return cy
      .create_and_login_as_regular_user_via_request(memberCredentials)
      .then((ok: boolean) => {
        expect(ok, "member registration").to.be.true;
        return cy.request<WhoamiResponseBody>({
          method: "GET",
          url: `/api/auth/whoami/${AUTH_APP_ID}`,
        });
      })
      .then((whoami) => {
        const member_uid = whoami.body.user?.uid as string;
        cy.logout();
        return cy
          .create_and_login_as_superuser_via_request()
          .then((ok: boolean) => {
            if (!ok) throw new Error("Failed to login as superuser");
            return cy.request<WhoamiResponseBody>({
              method: "GET",
              url: `/api/auth/whoami/${AUTH_APP_ID}`,
            });
          })
          .then((suWhoami) => {
            const owner_uid = suWhoami.body.user?.uid as string;
            cy.create_organization_via_request({
              organization_id,
              name: `Resource server role ${organization_id}`,
            });
            cy.request({
              method: "POST",
              url: "/api/apis",
              body: {
                api_server_id,
                api_server_name: `Role API ${api_server_id}`,
                api_server_description:
                  "ResourceServerOrganizationMemberRole.cy.ts",
                created_at: Date.now(),
                public: false,
                hardcoded: false,
                owner_type: "organization",
                owner_organization_id: organization_id,
              },
            }).then((response) => expect(response.status).to.eq(200));
            let invitation_id: string | undefined;
            cy.request<CreateInvitationResponseBody>({
              method: "POST",
              url: `/api/organizations/${organization_id}/invitations`,
              body: { input_mode: "uid", identifier: member_uid },
            }).then((invite) => {
              expect(invite.status).to.eq(201);
              invitation_id = invite.body.data?.invitation.invitation_id;
            });
            return cy.generate_jwks_access_key(api_server_id).then(
              ({ private_key }) => {
                if (!private_key) {
                  throw new Error("Failed to generate JWKS access key");
                }
                cy.logout();
                cy.login_via_request(
                  memberCredentials.email,
                  memberCredentials.password,
                ).then((ok: boolean) => expect(ok).to.be.true);
                cy.wrap(null, { log: false }).then(() => {
                  if (!invitation_id) {
                    throw new Error("Invitation id was not captured");
                  }
                  cy.request({
                    method: "PATCH",
                    url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
                    body: { action: "accept" },
                  }).then((response) => expect(response.status).to.eq(200));
                });
                cy.logout();
                return cy.wrap<Fixture>(
                  {
                    organization_id,
                    api_server_id,
                    private_key,
                    owner_uid,
                    member_uid,
                  },
                  { log: false },
                );
              },
            );
          });
      });
  });
}

function getRole(
  organization_id: string,
  uid: string,
  headers: Record<string, string>,
): Cypress.Chainable<Cypress.Response<MemberRoleResponseBody>> {
  return cy.request<MemberRoleResponseBody>({
    method: "GET",
    url: `/api/resource-server/organizations/${organization_id}/members/${uid}/role`,
    headers,
    failOnStatusCode: false,
  });
}

describe("GET /api/resource-server/organizations/:organization_id/members/:uid/role", () => {
  it("reports owner, member and null roles to the owning resource server", () => {
    setup().then((f) => {
      const cases: Array<{ uid: string; role: string | null }> = [
        { uid: f.owner_uid, role: "owner" },
        { uid: f.member_uid, role: "member" },
        { uid: UNKNOWN_UID, role: null },
      ];
      for (const { uid, role } of cases) {
        mintAssertion(f.api_server_id, f.private_key).then((token) => {
          getRole(f.organization_id, uid, {
            Authorization: `Bearer ${token}`,
            "X-Api-Server-Id": f.api_server_id,
          }).then((response) => {
            expect(response.status, `role for ${uid}`).to.eq(200);
            expect(response.body.success).to.eq(true);
            expect(response.body.data).to.deep.equal({
              organization_id: f.organization_id,
              uid,
              role,
            });
          });
        });
      }
    });
  });

  it("validates the path and headers before authenticating", () => {
    setup().then((f) => {
      mintAssertion(f.api_server_id, f.private_key).then((token) => {
        getRole(f.organization_id, f.owner_uid, {
          Authorization: `Bearer ${token}`,
        }).then((response) => {
          expect(response.status, "missing X-Api-Server-Id").to.eq(400);
          expect(response.body.success).to.eq(false);
        });
      });
      getRole(f.organization_id, f.owner_uid, {
        "X-Api-Server-Id": "bad id",
        Authorization: "Bearer irrelevant",
      }).then((response) => {
        expect(response.status, "malformed X-Api-Server-Id").to.eq(400);
      });
      getRole(f.organization_id, "not-a-uuid", {
        "X-Api-Server-Id": f.api_server_id,
        Authorization: "Bearer irrelevant",
      }).then((response) => {
        expect(response.status, "malformed uid").to.eq(400);
      });
      getRole("!!", f.owner_uid, {
        "X-Api-Server-Id": f.api_server_id,
        Authorization: "Bearer irrelevant",
      }).then((response) => {
        expect(response.status, "malformed organization id").to.eq(400);
      });
      getRole(f.organization_id, f.owner_uid, {
        "X-Api-Server-Id": f.api_server_id,
      }).then((response) => {
        expect(response.status, "missing Authorization").to.eq(401);
      });
      getRole(f.organization_id, f.owner_uid, {
        "X-Api-Server-Id": f.api_server_id,
        Authorization: "Bearer not-a-jwt",
      }).then((response) => {
        expect(response.status, "invalid assertion").to.eq(401);
      });
    });
  });

  it("refuses to answer for an organization the resource server does not belong to", () => {
    setup().then((f) => {
      mintAssertion(f.api_server_id, f.private_key).then((token) => {
        getRole("e2e-some-other-org", f.owner_uid, {
          Authorization: `Bearer ${token}`,
          "X-Api-Server-Id": f.api_server_id,
        }).then((response) => {
          expect(response.status).to.eq(403);
          expect(response.body.success).to.eq(false);
        });
      });
    });
  });
});
