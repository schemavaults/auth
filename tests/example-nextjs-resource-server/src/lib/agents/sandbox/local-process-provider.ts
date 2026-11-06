import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
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

export interface LocalProcessSandboxProviderOptions {
  /** Where sandbox directories are created, one per sandbox. */
  rootDir: string;
  /**
   * `PATH` the sandbox's commands run with. Default: the directory of the
   * runtime running this server (so `node` is the server's own Node.js, even
   * where it is not on `PATH`), then this process's `PATH`.
   */
  path?: string;
  /** Default `exec` timeout. Default: 30 seconds. */
  execTimeoutMs?: number;
  /** Output kept per stream; the rest is cut off. Default: 256 KiB. */
  maxOutputBytes?: number;
}

interface LocalSandboxState {
  /** The sandbox's directory: virtual `/` maps here. */
  root: string;
  env: Record<string, string>;
  running: boolean;
  children: Set<ChildProcess>;
}

/**
 * A `SandboxProvider` whose sandboxes are directories on this machine and
 * whose commands are child processes: the agent sessions example uses it so
 * its CI runs need no Docker daemon or cloud account. `SandboxManager`
 * drives it through the same lifecycle as the Docker and Vercel providers.
 *
 * Each sandbox gets its own directory; the virtual paths the manager hands
 * out (`/workspace/...`) are mapped into it. Commands run with a scrubbed
 * environment (`PATH`, `HOME`, `TMPDIR` and the sandbox's `spec.env`, never
 * this server's variables), so the app's client secret and keys stay out of
 * reach of whatever the agent runs.
 *
 * It is NOT an isolation boundary: commands run as this server's user, with
 * its network. That is why it enforces no `spec.network` policy (the manager
 * refuses restrictive ones); `createAgentSandboxManager()` explains when that
 * is acceptable. It runs one-shot commands only (no `spec.start`).
 */
export class LocalProcessSandboxProvider implements SandboxProvider {
  readonly name = "local-process";
  readonly defaultWorkdir = "/workspace";
  private readonly sandboxes = new Map<string, LocalSandboxState>();
  private readonly rootDir: string;
  private readonly hostPath: string;
  private readonly execTimeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(options: LocalProcessSandboxProviderOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.hostPath =
      options.path ??
      [path.dirname(process.execPath), process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin"].join(path.delimiter);
    this.execTimeoutMs = options.execTimeoutMs ?? 30_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 256 * 1024;
  }

  async create(input: ProviderCreateInput): Promise<ProviderCreateResult> {
    if (input.spec.start || input.spec.resume) {
      throw new SandboxError("The local-process provider runs one-shot commands only; omit spec.start");
    }
    const providerRef = `local-${input.id}`;
    const root = path.join(this.rootDir, providerRef);
    for (const dir of [input.workdir, "/home/agent", "/tmp"]) {
      await mkdir(this.realPath(root, dir), { recursive: true });
    }
    this.sandboxes.set(providerRef, {
      root,
      env: { ...input.spec.env },
      running: true,
      children: new Set(),
    });
    return { providerRef };
  }

  async wake(sandbox: ProviderSandbox): Promise<void> {
    this.lookup(sandbox).running = true;
  }

  async stop(sandbox: ProviderSandbox): Promise<void> {
    const state = this.lookup(sandbox);
    state.running = false;
    killAll(state);
  }

  async destroy(sandbox: ProviderSandbox): Promise<void> {
    const state = this.sandboxes.get(sandbox.providerRef);
    if (!state) return;
    killAll(state);
    this.sandboxes.delete(sandbox.providerRef);
    await rm(state.root, { recursive: true, force: true });
  }

  async status(sandbox: ProviderSandbox): Promise<ProviderSandboxStatus> {
    const state = this.sandboxes.get(sandbox.providerRef);
    if (!state) return "missing";
    return state.running ? "running" : "stopped";
  }

  async exec(sandbox: ProviderSandbox, command: NormalizedCommand, options: ExecOptions = {}): Promise<ExecResult> {
    const state = this.running(sandbox);
    const env: Record<string, string> = {
      PATH: this.hostPath,
      HOME: this.realPath(state.root, "/home/agent"),
      TMPDIR: this.realPath(state.root, "/tmp"),
      LANG: "C.UTF-8",
      ...state.env,
      ...command.env,
    };
    const child = spawn(command.cmd, command.args, {
      cwd: this.realPath(state.root, command.cwd),
      // Exactly these variables: nothing of this server's environment leaks in.
      env: env as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    state.children.add(child);

    const stdout = new OutputBuffer(this.maxOutputBytes);
    const stderr = new OutputBuffer(this.maxOutputBytes);
    // Buffer first: `onStdout?.(...)` would skip evaluating its argument.
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = stdout.append(chunk);
      options.onStdout?.(text);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = stderr.append(chunk);
      options.onStderr?.(text);
    });

    const kill = () => child.kill("SIGKILL");
    const timer = setTimeout(kill, options.timeoutMs ?? this.execTimeoutMs);
    options.signal?.addEventListener("abort", kill, { once: true });
    try {
      const exitCode: number = await new Promise((resolve) => {
        child.once("error", (error: Error) => {
          stderr.append(Buffer.from(`${command.cmd}: ${error.message}\n`));
          resolve(127);
        });
        child.once("close", (code: number | null, signal: NodeJS.Signals | null) =>
          resolve(code ?? (signal ? 137 : 1)),
        );
      });
      return { exitCode, stdout: stdout.text(), stderr: stderr.text() };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", kill);
      state.children.delete(child);
    }
  }

  async startMainProcess(): Promise<void> {
    throw new SandboxError("The local-process provider runs one-shot commands only");
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
    for (const file of files) {
      const target = this.realPath(state.root, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, { mode: file.mode });
      await chmod(target, file.mode);
    }
  }

  async readFile(sandbox: ProviderSandbox, filePath: string): Promise<Uint8Array | null> {
    const state = this.running(sandbox);
    try {
      return new Uint8Array(await readFile(this.realPath(state.root, filePath)));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async getUrl(sandbox: ProviderSandbox): Promise<string> {
    this.running(sandbox);
    throw new SandboxError("Local-process sandboxes expose no ports");
  }

  /** Maps a virtual sandbox path into the sandbox's directory, refusing to leave it. */
  private realPath(root: string, virtualPath: string): string {
    const resolved = path.resolve(root, `.${path.posix.resolve("/", virtualPath)}`);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new SandboxError(`Path ${virtualPath} is outside the sandbox`);
    }
    return resolved;
  }

  private lookup(sandbox: ProviderSandbox): LocalSandboxState {
    const state = this.sandboxes.get(sandbox.providerRef);
    if (!state) throw new ProviderSandboxMissingError(sandbox.providerRef);
    return state;
  }

  private running(sandbox: ProviderSandbox): LocalSandboxState {
    const state = this.lookup(sandbox);
    if (!state.running) throw new ProviderSandboxStoppedError(sandbox.providerRef);
    return state;
  }
}

function killAll(state: LocalSandboxState): void {
  for (const child of state.children) child.kill("SIGKILL");
  state.children.clear();
}

/** Collects a stream's output up to a byte limit; returns each chunk as text. */
class OutputBuffer {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  private truncated = false;

  constructor(private readonly limit: number) {}

  append(chunk: Buffer): string {
    const room = this.limit - this.size;
    if (room > 0) {
      const kept = chunk.subarray(0, room);
      this.chunks.push(kept);
      this.size += kept.length;
    }
    if (chunk.length > room) this.truncated = true;
    return chunk.toString("utf8");
  }

  text(): string {
    const text = Buffer.concat(this.chunks).toString("utf8");
    return this.truncated ? `${text}\n[output truncated]\n` : text;
  }
}
