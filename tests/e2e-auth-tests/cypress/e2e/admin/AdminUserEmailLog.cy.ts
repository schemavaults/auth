// Covers the e-mail log of a user (USER_EMAIL_LOG): every attempt to e-mail
// a verification or password reset link is recorded, whether the mail
// server accepted it or not, and administrators read it through
// GET /api/admin/users/[uid]/email-log and the "Email Log" timeline card on
// /admin/users/[uid]. The E2E stack has no mail server, so the attempts
// are recorded as failed with a reason; the spec accepts either status so
// it also holds against a stack that has one.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface EmailLogEntry {
  email_log_id: string;
  uid: string;
  email_type: "email_verification" | "password_reset";
  source: "registration" | "user_request" | "admin_request";
  recipient: string;
  status: "sent" | "failed";
  failure_reason: string | null;
  requested_by: string | null;
  requested_by_email: string | null;
  created_at: number;
}

interface ListEmailLogResponseBody {
  success: boolean;
  message?: string;
  data?: { entries: EmailLogEntry[] };
}

interface CreatedUser {
  uid: string;
  email: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const MALFORMED_UID = "not-a-uuid";

function loginAsSuperuser(): Cypress.Chainable<CreatedUser> {
  return cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) throw new Error("Failed to login as superuser");
    return cy
      .request({ method: "GET", url: `/api/auth/whoami/${AUTH_APP_ID}` })
      .then((whoami) => ({
        uid: whoami.body.user.uid as string,
        email: whoami.body.user.email as string,
      }));
  });
}

/** Registers a user by request (which e-mails them a verification link) and signs out. */
function createUser(): Cypress.Chainable<CreatedUser> {
  return cy.generate_random_test_user_credentials().then((credentials) => {
    return cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((created: boolean) => {
        expect(created, "regular user registration should succeed").to.be.true;
        return cy
          .request({ method: "GET", url: `/api/auth/whoami/${AUTH_APP_ID}` })
          .then((whoami) => {
            const user: CreatedUser = {
              uid: whoami.body.user.uid,
              email: credentials.email,
            };
            cy.clearCookies();
            return cy.wrap(user, { log: false });
          });
      });
  });
}

function listEmailLog(uid: string): Cypress.Chainable<EmailLogEntry[]> {
  return cy
    .request<ListEmailLogResponseBody>({
      method: "GET",
      url: `/api/admin/users/${uid}/email-log`,
    })
    .then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      return response.body.data?.entries ?? [];
    });
}

function expectRecordedAttempt(entry: EmailLogEntry | undefined, recipient: string): void {
  expect(entry, "log entry").to.exist;
  expect(entry!.recipient).to.eq(recipient);
  expect(entry!.status).to.be.oneOf(["sent", "failed"]);
  if (entry!.status === "failed") {
    expect(entry!.failure_reason, "failure reason").to.be.a("string").and.not.be.empty;
  } else {
    expect(entry!.failure_reason).to.eq(null);
  }
  expect(entry!.created_at).to.be.a("number").and.be.greaterThan(0);
}

describe("User e-mail log", () => {
  describe("GET /api/admin/users/:uid/email-log", () => {
    it("returns 400 for a malformed uid and an empty log for an unknown uid", () => {
      loginAsSuperuser();
      cy.request({
        method: "GET",
        url: `/api/admin/users/${MALFORMED_UID}/email-log`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body).to.have.property("success", false);
      });
      listEmailLog("00000000-0000-0000-0000-000000000099").then((entries) => {
        expect(entries).to.deep.equal([]);
      });
    });

    it("records the verification e-mail sent at registration and the e-mails the user requests", () => {
      createUser().then((user) => {
        cy.reset_rate_limit();
        cy.request({
          method: "POST",
          url: "/api/auth/reset-password/request",
          body: { email: user.email },
        })
          .its("status")
          .should("eq", 200);
        cy.request({
          method: "POST",
          url: "/api/auth/verify-email/request",
          body: { email: user.email },
        })
          .its("status")
          .should("eq", 200);

        loginAsSuperuser();
        listEmailLog(user.uid).then((entries) => {
          expect(entries, "log entries").to.have.length(3);
          expect(entries.every((entry) => entry.uid === user.uid)).to.eq(true);

          // Newest first.
          const [verificationRequest, passwordReset, registration] = entries;
          expect(verificationRequest!.email_type).to.eq("email_verification");
          expect(verificationRequest!.source).to.eq("user_request");
          expect(passwordReset!.email_type).to.eq("password_reset");
          expect(passwordReset!.source).to.eq("user_request");
          expect(registration!.email_type).to.eq("email_verification");
          expect(registration!.source).to.eq("registration");
          for (const entry of entries) {
            expectRecordedAttempt(entry, user.email);
            expect(entry.requested_by).to.eq(null);
            expect(entry.requested_by_email).to.eq(null);
          }
          expect(entries[0]!.created_at).to.be.at.least(entries[1]!.created_at);
          expect(entries[1]!.created_at).to.be.at.least(entries[2]!.created_at);
        });
      });
    });

    it("records an administrator's resend with the administrator", () => {
      createUser().then((user) => {
        loginAsSuperuser().then((admin) => {
          cy.request({
            method: "POST",
            url: `/api/admin/users/${user.uid}/resend-verification`,
            failOnStatusCode: false,
          }).then((response) => {
            // 500 when the mail server refuses (or is missing): still logged.
            expect(response.status).to.be.oneOf([200, 500]);
          });

          listEmailLog(user.uid).then((entries) => {
            expect(entries).to.have.length(2);
            const [resend] = entries;
            expect(resend!.email_type).to.eq("email_verification");
            expect(resend!.source).to.eq("admin_request");
            expect(resend!.requested_by).to.eq(admin.uid);
            expect(resend!.requested_by_email).to.eq(admin.email);
            expectRecordedAttempt(resend, user.email);
          });
        });
      });
    });
  });

  describe("Email Log card on /admin/users/[uid]", () => {
    it("shows the user's e-mails as a timeline and adds an administrator's resend to it", () => {
      createUser().then((user) => {
        cy.reset_rate_limit();
        cy.request({
          method: "POST",
          url: "/api/auth/reset-password/request",
          body: { email: user.email },
        });

        loginAsSuperuser().then((admin) => {
          cy.visit(`/admin/users/${user.uid}`);
          cy.wait_for_page_hydration();

          cy.get('[data-testid="admin-user-email-log-card"]').within(() => {
            cy.get('[data-testid="admin-user-email-log-timeline"]').should("exist");
            cy.get('[data-testid="admin-user-email-log-entry"]').should("have.length", 2);
            cy.get('[data-testid="admin-user-email-log-entry"]')
              .first()
              .should("have.attr", "data-email-type", "password_reset")
              .and("contain.text", "Password reset email")
              .and("contain.text", user.email);
            cy.get('[data-testid="admin-user-email-log-entry"]')
              .last()
              .should("have.attr", "data-email-source", "registration")
              .and("contain.text", "Verification email")
              .and("contain.text", "Sent at sign-up");
          });

          cy.get('[data-testid="admin-user-resend-verification-button"]').click();

          cy.get('[data-testid="admin-user-email-log-entry"]').should("have.length", 3);
          cy.get('[data-testid="admin-user-email-log-entry"]')
            .first()
            .should("have.attr", "data-email-source", "admin_request")
            .and("contain.text", `Resent by ${admin.email}`);
        });
      });
    });
  });
});
