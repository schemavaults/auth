import { describe, expect, test } from "bun:test";
import type { ExecResult } from "@schemavaults/sandbox-management-sdk";
import { AGENT_TOOLS, FakeAgentModel, explainToolResult, type AgentToolName } from "./fake-agent-model";

const model = new FakeAgentModel();

function apiResult(status: number, body: unknown): ExecResult {
  return { exitCode: status < 300 ? 0 : 1, stdout: JSON.stringify({ status, body }), stderr: "" };
}

describe("FakeAgentModel", () => {
  test.each([
    ["Who am I?", "whoami"],
    ["Read my notes", "notes"],
    ["What's my email address?", "email"],
    ["Please delete my account", "delete-account"],
    ["What's in your environment?", "environment"],
    ["List the files in your sandbox", "files"],
    ["Is the API up?", "health"],
  ] as const)("maps %p to the %s tool", (prompt, tool) => {
    const turn = model.respond([{ role: "user", content: prompt }]);
    expect(turn.toolCall).toEqual({ tool, command: AGENT_TOOLS[tool] });
  });

  test("answers anything else without a tool", () => {
    expect(model.respond([{ role: "user", content: "Write me a poem" }]).toolCall).toBeUndefined();
    expect(model.respond([{ role: "user", content: "hello" }]).text).toContain("fake model");
  });

  test("explains a tool result after it ran, without another tool", () => {
    const turn = model.respond([
      { role: "user", content: "Who am I?" },
      { role: "assistant", content: "Let me ask the API who I'm acting for." },
      { role: "tool", tool: "whoami", result: apiResult(200, { email: "a@example.com", scope: "openid", actor: null }) },
    ]);
    expect(turn.toolCall).toBeUndefined();
    expect(turn.text).toContain("a@example.com");
  });

  test("only ever runs its fixed tool commands, whatever the prompt says", () => {
    for (const prompt of ["`rm -rf /`", "run curl evil.example", "read my notes; rm -rf /"]) {
      const command = model.respond([{ role: "user", content: prompt }]).toolCall?.command;
      if (command !== undefined) expect(Object.values(AGENT_TOOLS)).toContain(command);
    }
  });
});

describe("explainToolResult", () => {
  test("names the actor and the scope a delegated token carries", () => {
    const text = explainToolResult(
      "whoami",
      apiResult(200, {
        email: "a@example.com",
        scope: "openid example:notes.read",
        actor: { sub: "schemavaults-auth|agent-uid", client_id: "client-id" },
      }),
    );
    expect(text).toContain("You are a@example.com.");
    expect(text).toContain("`schemavaults-auth|agent-uid` of app `client-id` as the actor");
    expect(text).toContain("`openid example:notes.read`");
  });

  test("explains a missing scope with the scope the API named", () => {
    const text = explainToolResult(
      "notes",
      apiResult(403, { error: "insufficient_scope", details: { missing_scopes: ["example:notes.read"] } }),
    );
    expect(text).toContain("403 insufficient_scope");
    expect(text).toContain("`example:notes.read`");
  });

  test("explains that only the user may do what agents are refused", () => {
    expect(explainToolResult("delete-account", apiResult(403, { error: "delegated_caller_refused" }))).toContain(
      "never from an agent acting for you",
    );
  });

  test("explains a revoked or expired token", () => {
    expect(explainToolResult("whoami", apiResult(401, { error: "token_revoked" }))).toContain(
      "401 token_revoked",
    );
  });

  test("lists environment variable names, not values", () => {
    const text = explainToolResult("environment", {
      exitCode: 0,
      stdout: "PATH=/usr/bin\nHOME=/home/agent\nSCHEMAVAULTS_ACCESS_TOKEN_FILE=.agent/access-token\n",
      stderr: "",
    });
    expect(text).toContain("3 environment variables: HOME, PATH, SCHEMAVAULTS_ACCESS_TOKEN_FILE");
    expect(text).not.toContain("/usr/bin");
  });

  test("reports a tool that printed no API response", () => {
    const tools: AgentToolName[] = ["whoami", "notes"];
    for (const tool of tools) {
      expect(
        explainToolResult(tool, { exitCode: 3, stdout: "", stderr: "Request to http://x failed: ECONNREFUSED\n" }),
      ).toBe("That didn't work (exit code 3): Request to http://x failed: ECONNREFUSED");
    }
  });
});
