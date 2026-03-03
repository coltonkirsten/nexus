/**
 * Codex CLI Runner — spawns the OpenAI `codex` binary to handle agent messages.
 * Used when CELL_MODE=codex.
 *
 * Mirrors gemini-cli-runner.ts but targets the OpenAI Codex CLI (@openai/codex).
 * The Codex CLI provides built-in tools, sandbox modes, and `--json` for
 * streaming newline-delimited JSON events.
 *
 * Key differences from Claude/Gemini:
 * - Uses --json flag for streaming JSON output
 * - Uses --full-auto or --dangerously-bypass-approvals-and-sandbox for headless mode
 * - System prompt via CODEX.md file in ~/.codex/
 * - MCP support may be limited - we use built-in tools only
 */

import { spawn, ChildProcess } from "child_process";
import { writeFile, mkdir, symlink, lstat } from "fs/promises";
import { getPeers } from "./mcp.js";

export interface CodexCliRunnerOptions {
  message: string;
  systemPrompt: string;      // Written to ~/.codex/instructions.md or passed via stdin
  appendPrompt: string;      // Appended to system prompt
  model?: string;            // default: "gpt-5-codex" or "o3"
  maxTurns?: number;         // informational only
  sessionId?: string | null; // Codex doesn't have resume like Claude - use --ephemeral false
  abortSignal?: AbortSignal;
  onLogEntry: (type: string, data: unknown) => void;
}

export interface CodexCliRunnerResult {
  resultText: string;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Create a symlink if it doesn't already exist.
 * We symlink /ledger and /shared into /workspace for access since
 * Codex sandbox restricts file operations to workspace.
 */
async function ensureSymlink(target: string, linkPath: string): Promise<void> {
  try {
    await lstat(linkPath);
    // Already exists (symlink or real dir) — skip
  } catch {
    await symlink(target, linkPath);
  }
}

/**
 * Write the system prompt to ~/.codex/instructions.md.
 * Codex CLI reads custom instructions from this file.
 */
async function writeSystemPromptFile(systemPrompt: string, appendPrompt: string): Promise<void> {
  const home = process.env.HOME || "/home/agent";
  const codexDir = `${home}/.codex`;
  await mkdir(codexDir, { recursive: true });

  let content = systemPrompt;
  if (appendPrompt) {
    content += "\n\n---\n\n" + appendPrompt;
  }

  // Codex reads instructions from instructions.md
  await writeFile(`${codexDir}/instructions.md`, content, "utf-8");
}

/**
 * Write MCP config to ~/.codex/config.toml.
 * Codex CLI supports MCP servers via the mcp.servers config section.
 */
async function writeMcpConfig(): Promise<void> {
  const home = process.env.HOME || "/home/agent";
  const codexDir = `${home}/.codex`;
  await mkdir(codexDir, { recursive: true });

  const peers = getPeers();
  const agentId = process.env.AGENT_ID || "unknown";

  // Write peers file for MCP stdio process
  await writeFile("/tmp/nexus-peers.json", JSON.stringify(peers), "utf-8");

  // Codex uses TOML config format
  // Reference: https://developers.openai.com/codex/cli/reference/
  const config = `# NEXUS Cell Configuration
[model]
default = "o3"

[mcp.servers.nexus-intercom]
command = "node"
args = ["/opt/engine/dist/mcp-stdio.js"]

[mcp.servers.nexus-intercom.env]
NEXUS_API_URL = "${process.env.NEXUS_API_URL || 'http://host.docker.internal:3001'}"
AGENT_ID = "${agentId}"
AGENT_NAME = "${process.env.AGENT_NAME || 'Agent'}"
NEXUS_PEERS = '${JSON.stringify(peers)}'
`;

  await writeFile(`${codexDir}/config.toml`, config, "utf-8");
}

/**
 * Write peer agents info to a file the agent can read.
 * This is a fallback if MCP doesn't work - info available via the shared drive.
 */
async function writePeersInfo(): Promise<void> {
  const peers = getPeers();
  const agentId = process.env.AGENT_ID || "unknown";

  // Filter out self
  const otherPeers = peers.filter(p => p.id !== agentId);

  if (otherPeers.length > 0) {
    const peersInfo = {
      note: "These are other agents in your NEXUS team. Communication is handled via the shared drive at /workspace/shared/",
      peers: otherPeers.map(p => ({
        name: p.name,
        status: p.status,
      })),
    };
    await mkdir("/workspace", { recursive: true });
    await writeFile("/workspace/.nexus-peers.json", JSON.stringify(peersInfo, null, 2), "utf-8");
  }
}

/**
 * Runs the Codex CLI with the given message and options.
 * Parses streaming JSON output line-by-line and normalizes events
 * to the format the dashboard expects.
 *
 * Codex CLI JSON events (based on documentation):
 *   { type: "start", session_id?, model }
 *   { type: "message", role: "assistant"|"user", content }
 *   { type: "tool_call", name, arguments }
 *   { type: "tool_result", output, error? }
 *   { type: "done", usage: { prompt_tokens, completion_tokens } }
 *   { type: "error", message }
 */
export async function runCodexCliAgent(options: CodexCliRunnerOptions): Promise<CodexCliRunnerResult> {
  // Pre-spawn setup: write system prompt, MCP config, and peers info
  await writeSystemPromptFile(options.systemPrompt, options.appendPrompt);
  await writeMcpConfig();
  await writePeersInfo();

  // Symlink /ledger and /shared into /workspace for access
  await ensureSymlink("/ledger", "/workspace/ledger");
  await ensureSymlink("/shared", "/workspace/shared");

  // Build CLI arguments
  // Using `codex exec` for non-interactive execution with JSON output
  const args: string[] = [
    "exec",
    options.message,
    "--json",                              // Streaming JSON output
    "--dangerously-bypass-approvals-and-sandbox",  // Full headless mode (like --yolo)
    "-m", options.model || "o3",           // Model selection
  ];

  // Session resume — use --last for most recent session in this container
  if (options.sessionId) {
    args.push("--last");
  }

  options.onLogEntry("cli_spawn", {
    args: args.map((a) =>
      a.length > 200 ? `${a.slice(0, 200)}... (${a.length} chars)` : a
    ),
    cwd: "/workspace",
    cellMode: "codex",
  });

  let resultText = "";
  let assistantTextBuffer = "";  // Accumulate assistant messages
  let sessionId: string | null = options.sessionId || null;
  let inputTokens = 0;
  let outputTokens = 0;

  return new Promise<CodexCliRunnerResult>((resolve, reject) => {
    const proc: ChildProcess = spawn("codex", args, {
      cwd: "/workspace",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        HOME: process.env.HOME || "/home/agent",
        // Codex uses OPENAI_API_KEY for authentication
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
    });

    // Detect startup hang
    let gotFirstOutput = false;
    const startupTimer = setTimeout(() => {
      if (!gotFirstOutput) {
        options.onLogEntry("cli_startup_slow", {
          message: "No output from codex CLI after 60 seconds. Process may be hanging.",
          pid: proc.pid,
        });
      }
    }, 60_000);

    // Handle abort
    if (options.abortSignal) {
      const onAbort = () => {
        proc.kill("SIGTERM");
      };
      options.abortSignal.addEventListener("abort", onAbort, { once: true });
      proc.on("exit", () => {
        options.abortSignal?.removeEventListener("abort", onAbort);
      });
    }

    let stdoutBuffer = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      if (!gotFirstOutput) {
        gotFirstOutput = true;
        clearTimeout(startupTimer);
        options.onLogEntry("cli_first_output", { message: "First output received from codex CLI" });
      }

      stdoutBuffer += chunk.toString("utf-8");

      // Process complete lines (newline-delimited JSON)
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          processCodexEvent(event, options);

          // Extract session ID from start events
          if (event.type === "start" && event.session_id) {
            sessionId = event.session_id;
          }

          // Accumulate assistant message text
          if (event.type === "message" && event.role === "assistant" && event.content) {
            assistantTextBuffer = event.content;
          }

          // Reset buffer on tool calls (new turn)
          if (event.type === "tool_call") {
            assistantTextBuffer = "";
          }

          // Extract token usage from done events
          if (event.type === "done") {
            resultText = assistantTextBuffer || resultText;
            const usage = event.usage as Record<string, number> | undefined;
            if (usage) {
              if (typeof usage.prompt_tokens === "number") {
                inputTokens += usage.prompt_tokens;
              }
              if (typeof usage.completion_tokens === "number") {
                outputTokens += usage.completion_tokens;
              }
            }
          }

          // Handle errors
          if (event.type === "error") {
            resultText = event.message || "Codex CLI error";
          }
        } catch {
          // Not JSON — log as raw output
          options.onLogEntry("cli_output", { raw: trimmed });
        }
      }
    });

    // Stream stderr for diagnostics
    let stderrBuffer = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      stderrBuffer += text;
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          options.onLogEntry("cli_stderr", { line: trimmed });
        }
      }
    });

    proc.on("error", (err) => {
      clearTimeout(startupTimer);
      reject(new Error(`Codex CLI process error: ${err.message}`));
    });

    proc.on("exit", (code, signal) => {
      clearTimeout(startupTimer);

      // Process any remaining stdout
      if (stdoutBuffer.trim()) {
        try {
          const event = JSON.parse(stdoutBuffer.trim());
          processCodexEvent(event, options);
          if (event.type === "done") {
            resultText = assistantTextBuffer || resultText;
            const usage = event.usage as Record<string, number> | undefined;
            if (usage) {
              if (typeof usage.prompt_tokens === "number") {
                inputTokens += usage.prompt_tokens;
              }
              if (typeof usage.completion_tokens === "number") {
                outputTokens += usage.completion_tokens;
              }
            }
          }
        } catch {
          options.onLogEntry("cli_output", { raw: stdoutBuffer.trim() });
        }
      }

      options.onLogEntry("cli_exit", { code, signal, stderrLength: stderrBuffer.length });

      if (signal === "SIGTERM") {
        resolve({ resultText, sessionId, inputTokens, outputTokens });
      } else if (code !== 0) {
        const errMsg = stderrBuffer.trim() || resultText || `Codex CLI exited with code ${code}`;
        options.onLogEntry("cli_error", { code, stderr: stderrBuffer.trim(), resultError: resultText });
        reject(new Error(errMsg));
      } else {
        resolve({ resultText, sessionId, inputTokens, outputTokens });
      }
    });
  });
}

/**
 * Normalize a Codex CLI JSON event into the format the dashboard expects.
 * The dashboard expects messages in SDK-compatible format (same as Claude/Gemini).
 */
function processCodexEvent(
  event: Record<string, unknown>,
  options: CodexCliRunnerOptions,
): void {
  switch (event.type) {
    case "start": {
      // Normalize to SDK init format
      options.onLogEntry("agent_message", {
        type: "system",
        subtype: "init",
        session_id: event.session_id || null,
        model: event.model,
      });
      break;
    }

    case "message": {
      if (event.role === "assistant") {
        options.onLogEntry("agent_message", {
          type: "assistant",
          message: {
            content: [{ type: "text", text: event.content || "" }],
          },
        });
      } else if (event.role === "user") {
        options.onLogEntry("agent_message", {
          type: "user",
          message: {
            content: [{ type: "text", text: event.content || "" }],
          },
        });
      }
      break;
    }

    case "tool_call": {
      options.onLogEntry("agent_message", {
        type: "assistant",
        message: {
          content: [{
            type: "tool_use",
            id: event.id || `tool_${Date.now()}`,
            name: event.name,
            input: event.arguments || {},
          }],
        },
      });
      break;
    }

    case "tool_result": {
      const resultContent = event.error
        ? JSON.stringify(event.error)
        : (event.output || "");
      options.onLogEntry("agent_message", {
        type: "user",
        message: {
          content: [{
            type: "tool_result",
            tool_use_id: event.tool_call_id || event.id || "unknown",
            content: resultContent,
          }],
        },
      });
      break;
    }

    case "error": {
      options.onLogEntry("agent_message", {
        type: "system",
        subtype: "error",
        message: event.message,
      });
      break;
    }

    case "done": {
      const usage = event.usage as Record<string, number> | undefined;
      options.onLogEntry("agent_message", {
        type: "result",
        result: "",
        is_error: false,
        usage: usage ? {
          input_tokens: usage.prompt_tokens || 0,
          output_tokens: usage.completion_tokens || 0,
        } : undefined,
      });
      break;
    }

    default: {
      // Unknown event type — log as-is
      options.onLogEntry("agent_message", event);
      break;
    }
  }
}
