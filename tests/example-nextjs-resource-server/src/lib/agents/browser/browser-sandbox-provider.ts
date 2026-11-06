// NOT server-only: runs in the browser (unit tested).

import {
  ProviderSandboxMissingError,
  ProviderSandboxStoppedError,
  SandboxError,
  type ExecOptions,
  type ExecResult,
  type MainLogChunk,
  type MainProcessInfo,
  type NormalizedCommand,
  type ProviderCreateInput,
  type ProviderCreateResult,
  type ProviderSandbox,
  type ProviderSandboxStatus,
  type ResolvedSandboxFile,
  type SandboxProvider,
} from "@schemavaults/sandbox-management-sdk";
import type { WebStorageLike } from "@schemavaults/sandbox-management-sdk/web-storage";
import { runAgentShell, type AgentFetch, type AgentShellFiles } from "./agent-shell";

interface BrowserSandboxState {
  env: Record<string, string>;
  running: boolean;
  /** Text files by absolute path. */
  files: Record<string, string>;
}

export interface BrowserSandboxProviderOptions {
  /** Where each sandbox's state is kept, e.g. `localStorage`. */
  storage: WebStorageLike;
  /** Prefix of the storage keys. Default: `"example-agents:sandbox-state:"`. */
  prefix?: string;
  /** What the agent's `api` command calls the API with. Default: the global `fetch`. */
  fetch?: AgentFetch;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * A `SandboxProvider` whose sandboxes live in the user's browser: each is a
 * set of text files and an environment, kept in Web Storage so it survives
 * page loads, and its commands run in the agent shell (agent-shell.ts).
 * `SandboxManager` drives it through the same lifecycle as the Docker and
 * Vercel providers.
 *
 * The agent and its delegated token stay in the browser of the user it acts
 * for, and the server keeps nothing between requests: what lets the example
 * run on serverless hosts. The app's secrets never reach the browser. It
 * runs one-shot commands only (no `spec.start`) and exposes no ports.
 */
export class BrowserSandboxProvider implements SandboxProvider {
  readonly name = "browser";
  readonly defaultWorkdir = "/workspace";
  private readonly storage: WebStorageLike;
  private readonly prefix: string;
  private readonly fetchImpl: AgentFetch;

  constructor(options: BrowserSandboxProviderOptions) {
    this.storage = options.storage;
    this.prefix = options.prefix ?? "example-agents:sandbox-state:";
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  async create(input: ProviderCreateInput): Promise<ProviderCreateResult> {
    if (input.spec.start || input.spec.resume) {
      throw new SandboxError("Browser sandboxes run one-shot commands only; omit spec.start");
    }
    const providerRef = `browser-${input.id}`;
    this.write(providerRef, { env: { HOME: "/home/agent", ...input.spec.env }, running: true, files: {} });
    return { providerRef };
  }

  async wake(sandbox: ProviderSandbox): Promise<void> {
    this.write(sandbox.providerRef, { ...this.lookup(sandbox), running: true });
  }

  async stop(sandbox: ProviderSandbox): Promise<void> {
    this.write(sandbox.providerRef, { ...this.lookup(sandbox), running: false });
  }

  async destroy(sandbox: ProviderSandbox): Promise<void> {
    this.storage.removeItem(this.prefix + sandbox.providerRef);
  }

  async status(sandbox: ProviderSandbox): Promise<ProviderSandboxStatus> {
    const state = this.read(sandbox.providerRef);
    if (!state) return "missing";
    return state.running ? "running" : "stopped";
  }

  async exec(sandbox: ProviderSandbox, command: NormalizedCommand, options: ExecOptions = {}): Promise<ExecResult> {
    const state = this.running(sandbox);
    const result = await runAgentShell(command, {
      files: filesOf(state),
      env: { ...state.env, PWD: command.cwd, ...command.env },
      fetch: this.fetchImpl,
    });
    if (result.stdout) options.onStdout?.(result.stdout);
    if (result.stderr) options.onStderr?.(result.stderr);
    return result;
  }

  async startMainProcess(): Promise<void> {
    throw new SandboxError("Browser sandboxes run one-shot commands only");
  }

  async getMainProcess(sandbox: ProviderSandbox): Promise<MainProcessInfo | null> {
    this.running(sandbox);
    return null;
  }

  async readMainLog(sandbox: ProviderSandbox, offset: number): Promise<MainLogChunk> {
    this.running(sandbox);
    return { data: new Uint8Array(), nextOffset: offset };
  }

  async writeFiles(sandbox: ProviderSandbox, files: ResolvedSandboxFile[]): Promise<void> {
    const state = this.running(sandbox);
    const next = { ...state.files };
    for (const file of files) next[file.path] = decoder.decode(file.content);
    this.write(sandbox.providerRef, { ...state, files: next });
  }

  async readFile(sandbox: ProviderSandbox, path: string): Promise<Uint8Array | null> {
    const content = this.running(sandbox).files[path];
    return content === undefined ? null : encoder.encode(content);
  }

  async getUrl(sandbox: ProviderSandbox): Promise<string> {
    this.running(sandbox);
    throw new SandboxError("Browser sandboxes expose no ports");
  }

  private read(providerRef: string): BrowserSandboxState | null {
    const raw = this.storage.getItem(this.prefix + providerRef);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BrowserSandboxState;
    } catch {
      return null;
    }
  }

  private write(providerRef: string, state: BrowserSandboxState): void {
    this.storage.setItem(this.prefix + providerRef, JSON.stringify(state));
  }

  private lookup(sandbox: ProviderSandbox): BrowserSandboxState {
    const state = this.read(sandbox.providerRef);
    if (!state) throw new ProviderSandboxMissingError(sandbox.providerRef);
    return state;
  }

  private running(sandbox: ProviderSandbox): BrowserSandboxState {
    const state = this.lookup(sandbox);
    if (!state.running) throw new ProviderSandboxStoppedError(sandbox.providerRef);
    return state;
  }
}

/** A sandbox's files as the agent shell sees them: directories are implied by paths. */
function filesOf(state: BrowserSandboxState): AgentShellFiles {
  return {
    read: (path) => state.files[path] ?? null,
    list: (dir) => {
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const names = new Set<string>();
      for (const path of Object.keys(state.files)) {
        if (path.startsWith(prefix)) names.add(path.slice(prefix.length).split("/")[0] ?? "");
      }
      names.delete("");
      return [...names].sort();
    },
  };
}
