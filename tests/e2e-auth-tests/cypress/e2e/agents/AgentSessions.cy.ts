// AgentSessions.cy.ts
//
// The worked example of auth for agents, end to end: the example resource
// server's /agents app (tests/example-nextjs-resource-server/src/app/agents,
// src/lib/agents) is a third-party app whose users start agent sessions.
//
//   - The app signs the user in as a CONFIDENTIAL client, for the example API
//     (RFC 8707 `resource`) with the scopes an agent may get; the user
//     consents to them on the auth server.
//   - Each agent session gets a sandbox (@schemavaults/sandbox-management-sdk,
//     local-process provider) and a DELEGATED token (RFC 8693 token
//     exchange) narrowed to the scopes the user picked for it. A fake model
//     picks a tool; the tool calls the example API from the sandbox with the
//     delegated token, never with the app's secrets.
//   - The API sees the agent as the actor and enforces the session's scope;
//     it refuses agents what only the user may do (`delegatedCallers`), and
//     it checks delegated tokens with the auth server (introspection), so
//     revoking the agent's access, ending its session or signing out of the
//     app (which revokes the sign-in's tokens, agents' included) cuts the
//     agent off at once.
//
// The example app and the confidential client are seeded in
// cypress.config.ts's before:run hook. This spec defines the example API's
// notes scope and turns on delegated tokens for the example API.

interface Credentials {
  email: string;
  password: string;
}

interface ApiServerScopeBody {
  api_server_scope_id: string;
  scope: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("Agent sessions: agents in sandboxes, acting for users with delegated tokens", () => {
  const EXAMPLE_API_SERVER_ID = "00000000-0000-0000-0000-000000000000";
  const SCOPES_URL = `/api/apis/${EXAMPLE_API_SERVER_ID}/scopes`;
  const NOTES_READ = "example:notes.read";

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") || "http://example-nextjs-resource-server:3007";
  // cy.origin() needs the normalized origin (no default port).
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;
  const confidentialClientId: string = Cypress.env("OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID");
  const confidentialClientSecret: string = Cypress.env("OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET");

  function logoutIfAuthenticated(): void {
    cy.is_authenticated().then((authenticated: boolean) => {
      if (authenticated) {
        cy.logout();
      }
    });
  }

  function loginAsSuperuser(): void {
    logoutIfAuthenticated();
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  }

  function setDelegatedTokenPolicy(accept: boolean): void {
    cy.request({
      method: "PUT",
      url: `/api/apis/${EXAMPLE_API_SERVER_ID}/delegated-token-policy`,
      body: { accept_delegated_tokens: accept },
    }).its("status").should("equal", 200);
  }

  /** A new user with a verified address (third-party apps require one), signed out. */
  function createUser(): Cypress.Chainable<Credentials> {
    logoutIfAuthenticated();
    return cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) => {
        expect(ok, "user created").to.be.true;
      });
      cy.verify_email_via_request(credentials.email).then((verified: boolean) => {
        expect(verified, "email verified").to.be.true;
      });
      cy.logout();
      return cy.wrap<Credentials>({ email: credentials.email, password: credentials.password });
    });
  }

  /**
   * Signs in to the agents app through the auth server's login page, and its
   * consent screen the first time (the notes scope is a checkbox there).
   */
  function signInToAgentsApp(user: Credentials, consent: boolean): void {
    logoutIfAuthenticated();
    cy.origin(exampleAppOrigin, () => {
      cy.visit("/agents");
      cy.get('[data-testid="agents-sign-in"]', { timeout: 20000 }).click();
    });

    cy.url({ timeout: 20000 }).should("include", "/auth/login");
    cy.wait_for_page_hydration();
    cy.get("input[name='email']").should("be.visible").type(user.email, { force: true });
    cy.get("input[name='password']").should("be.visible").type(user.password, { force: true });
    cy.get("button[type='submit']").should("not.be.disabled").click();
    if (consent) {
      cy.get('[data-testid="consent-api-scope-checkbox"]', { timeout: 20000 })
        .should("have.length", 1)
        .and("have.attr", "data-scope", NOTES_READ)
        .and("have.attr", "data-state", "checked");
      cy.get('[data-testid="consent-authorize-button"]').should("not.be.disabled").click();
    }

    cy.origin(exampleAppOrigin, { args: { email: user.email } }, ({ email }) => {
      cy.location("pathname", { timeout: 30000 }).should("eq", "/agents");
      cy.get('[data-testid="agent-workspace"][data-ready="true"]', { timeout: 20000 }).should("exist");
      cy.get('[data-testid="agents-signed-in-email"]').should("have.text", email);
    });
  }

  before(() => {
    cy.reset_rate_limit();
    loginAsSuperuser();
    // The example API's notes scope, which the agents app asks users for.
    cy.request<{ list: ApiServerScopeBody[] }>({ method: "GET", url: SCOPES_URL }).then((listed) => {
      if (!listed.body.list.some((row) => row.scope === NOTES_READ)) {
        cy.request({ method: "POST", url: SCOPES_URL, body: { scope: NOTES_READ, description: "Read your notes" } });
      }
    });
    setDelegatedTokenPolicy(true);
    cy.logout();
  });

  after(() => {
    loginAsSuperuser();
    setDelegatedTokenPolicy(false);
    cy.logout();
  });

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("starts an agent that calls the API as the user's agent, within the limits it was given", () => {
    createUser().then((user) => {
      signInToAgentsApp(user, true);
      cy.origin(
        exampleAppOrigin,
        { args: { email: user.email, confidentialClientId, confidentialClientSecret } },
        ({ email, confidentialClientId, confidentialClientSecret }) => {
          const ask = (prompt: string, toolCalls: number) => {
            cy.get('[data-testid="agent-prompt"]').should("not.be.disabled").type(prompt);
            cy.get('[data-testid="agent-prompt-submit"]').should("not.be.disabled").click();
            cy.get('[data-testid="agent-tool-call"]', { timeout: 30000 }).should("have.length", toolCalls);
          };
          const lastAnswer = () => cy.get('[data-testid="agent-message"][data-role="assistant"]').last();

          // Both scopes the user granted the app are offered, and picked.
          cy.get('[data-testid="agent-scope-option"]')
            .should("have.length", 2)
            .each(($option) => expect($option.attr("data-state")).to.equal("checked"));

          ask("Who am I?", 1);
          cy.get('[data-testid="agent-event"]').first().should("contain.text", "Minted a delegated token");
          cy.get('[data-testid="agent-event"]')
            .eq(1)
            .should("contain.text", "Started sandbox")
            .and("contain.text", "local-process provider");
          cy.get('[data-testid="agent-tool-call"]')
            .last()
            .should("have.attr", "data-tool", "whoami")
            .and("have.attr", "data-exit-code", "0");
          // The API sees the user as the subject and the app's agent as the actor.
          lastAnswer()
            .should("contain.text", `You are ${email}.`)
            .and("contain.text", `of app ${confidentialClientId} as the actor`)
            .and("contain.text", "openid email example:notes.read");
          cy.get('[data-testid="agent-credential-status"]').should("have.attr", "data-status", "active");
          cy.get('[data-testid="agent-session-scope"]').should("have.text", "openid email example:notes.read");

          ask("Read my notes", 2);
          cy.get('[data-testid="agent-tool-call"]').last().should("have.attr", "data-exit-code", "0");
          lastAnswer().should("contain.text", "You have no notes yet.");

          // Whatever its scope, an agent may not do what only the user may.
          ask("Delete my account", 3);
          cy.get('[data-testid="agent-tool-call"]')
            .last()
            .should("have.attr", "data-tool", "delete-account")
            .and("have.attr", "data-exit-code", "1");
          lastAnswer().should("contain.text", "403 delegated_caller_refused");

          // The sandbox holds the agent's own token and nothing of the app's.
          ask("What's in your environment?", 4);
          cy.get('[data-testid="agent-tool-output"]')
            .last()
            .invoke("text")
            .should((output: string) => {
              expect(output).to.contain("SCHEMAVAULTS_ACCESS_TOKEN_FILE=.agent/access-token");
              expect(output).not.to.contain(confidentialClientSecret);
              expect(output).not.to.contain("CLIENT_SECRET");
              expect(output).not.to.contain("JWKS_ACCESS_PRIVATE_KEY");
            });
          lastAnswer().should("contain.text", "None of them holds a secret of the app");

          cy.get('[data-testid="agent-session-item"]').should("have.length", 1);
        },
      );
    });
  });

  it("gives a session only the access its user picked for it", () => {
    createUser().then((user) => {
      signInToAgentsApp(user, true);
      cy.origin(exampleAppOrigin, { args: { email: user.email, NOTES_READ } }, ({ email, NOTES_READ }) => {
        const ask = (prompt: string, toolCalls: number) => {
          cy.get('[data-testid="agent-prompt"]').should("not.be.disabled").type(prompt);
          cy.get('[data-testid="agent-prompt-submit"]').should("not.be.disabled").click();
          cy.get('[data-testid="agent-tool-call"]', { timeout: 30000 }).should("have.length", toolCalls);
        };
        const lastAnswer = () => cy.get('[data-testid="agent-message"][data-role="assistant"]').last();

        cy.get(`[data-testid="agent-scope-option"][data-scope="${NOTES_READ}"]`)
          .click()
          .should("have.attr", "data-state", "unchecked");

        ask("Read my notes", 1);
        cy.get('[data-testid="agent-session-scope"]').should("have.text", "openid email");
        cy.get('[data-testid="agent-tool-call"]').last().should("have.attr", "data-exit-code", "1");
        lastAnswer().should("contain.text", "403 insufficient_scope").and("contain.text", NOTES_READ);

        ask("What's my email address?", 2);
        cy.get('[data-testid="agent-tool-call"]').last().should("have.attr", "data-exit-code", "0");
        lastAnswer().should("contain.text", `Your email address is ${email}.`);
      });
    });
  });

  it("cuts the agent off when its access is revoked, until the user grants it again", () => {
    createUser().then((user) => {
      signInToAgentsApp(user, true);
      cy.origin(exampleAppOrigin, () => {
        const ask = (prompt: string, toolCalls: number) => {
          cy.get('[data-testid="agent-prompt"]').should("not.be.disabled").type(prompt);
          cy.get('[data-testid="agent-prompt-submit"]').should("not.be.disabled").click();
          cy.get('[data-testid="agent-tool-call"]', { timeout: 30000 }).should("have.length", toolCalls);
        };
        const lastToolExitCode = () => cy.get('[data-testid="agent-tool-call"]').last().invoke("attr", "data-exit-code");

        ask("Who am I?", 1);
        lastToolExitCode().should("equal", "0");

        cy.get('[data-testid="revoke-agent-access"]').click();
        cy.get('[data-testid="agent-credential-status"]', { timeout: 20000 }).should("have.attr", "data-status", "revoked");
        cy.get('[data-testid="agent-event"]').last().should("contain.text", "You revoked the agent's access");

        // The API checks delegated tokens with the auth server: refused at once.
        ask("Who am I?", 2);
        lastToolExitCode().should("equal", "1");
        cy.get('[data-testid="agent-message"][data-role="assistant"]').last().should("contain.text", "401 token_revoked");

        cy.get('[data-testid="grant-agent-access"]').click();
        cy.get('[data-testid="agent-credential-status"]', { timeout: 20000 }).should("have.attr", "data-status", "active");
        cy.get('[data-testid="agent-event"]').last().should("contain.text", "Granted the agent access again");

        ask("Who am I?", 3);
        lastToolExitCode().should("equal", "0");
      });
    });
  });

  it("ends a session: revokes the agent's token and destroys its sandbox", () => {
    createUser().then((user) => {
      signInToAgentsApp(user, true);
      cy.origin(exampleAppOrigin, () => {
        cy.get('[data-testid="agent-prompt"]').type("Who am I?");
        cy.get('[data-testid="agent-prompt-submit"]').click();
        cy.get('[data-testid="agent-tool-call"]', { timeout: 30000 })
          .should("have.length", 1)
          .and("have.attr", "data-exit-code", "0");

        cy.get('[data-testid="end-agent-session"]').click();
        cy.get('[data-testid="agent-credential-status"]', { timeout: 20000 }).should("have.attr", "data-status", "ended");
        cy.get('[data-testid="agent-event"]')
          .last()
          .should("contain.text", "Session ended: the agent's token no longer works, and its sandbox is destroyed.");
        cy.get('[data-testid="agent-prompt"]').should("be.disabled");
        cy.get('[data-testid="revoke-agent-access"]').should("not.exist");
        cy.get('[data-testid="grant-agent-access"]').should("not.exist");
        cy.get('[data-testid="agent-session-item"]').should("have.attr", "data-status", "completed");
      });
    });
  });

  it("ends the agents' access when the user signs out of the app", () => {
    createUser().then((user) => {
      signInToAgentsApp(user, true);
      cy.origin(exampleAppOrigin, () => {
        cy.get('[data-testid="agent-prompt"]').type("Who am I?");
        cy.get('[data-testid="agent-prompt-submit"]').click();
        cy.get('[data-testid="agent-tool-call"]', { timeout: 30000 })
          .should("have.length", 1)
          .and("have.attr", "data-exit-code", "0");

        // Revokes the sign-in's refresh token: the auth server revokes every
        // token of that sign-in, the agent's delegated token included.
        cy.get('[data-testid="agents-sign-out"]').click();
        cy.get('[data-testid="agents-signed-out"]', { timeout: 20000 }).should("be.visible");
      });

      // Back in (no consent screen this time): the session is still listed.
      signInToAgentsApp(user, false);
      cy.origin(exampleAppOrigin, () => {
        cy.get('[data-testid="agent-session-item"]').should("have.length", 1).find("button").first().click();
        cy.get('[data-testid="agent-conversation"]').should("exist");
        cy.get('[data-testid="agent-prompt"]').type("Who am I?");
        cy.get('[data-testid="agent-prompt-submit"]').click();
        cy.get('[data-testid="agent-tool-call"]', { timeout: 30000 })
          .should("have.length", 2)
          .last()
          .should("have.attr", "data-exit-code", "1");
        cy.get('[data-testid="agent-message"][data-role="assistant"]').last().should("contain.text", "401 token_revoked");
        cy.get('[data-testid="agent-credential-status"]').should("have.attr", "data-status", "rejected");

        // The new sign-in can vouch for the agent again.
        cy.get('[data-testid="grant-agent-access"]').click();
        cy.get('[data-testid="agent-credential-status"]', { timeout: 20000 }).should("have.attr", "data-status", "active");
        cy.get('[data-testid="agent-prompt"]').type("Who am I?");
        cy.get('[data-testid="agent-prompt-submit"]').click();
        cy.get('[data-testid="agent-tool-call"]', { timeout: 30000 })
          .should("have.length", 3)
          .last()
          .should("have.attr", "data-exit-code", "0");
      });
    });
  });
});
