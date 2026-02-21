/**
 * Gemini CLI Runner — spawns the `gemini` binary to handle agent messages.
 * Used when CELL_MODE=gemini.
 *
 * Mirrors cli-runner.ts but targets the Gemini CLI (@google/gemini-cli).
 * The Gemini CLI provides built-in tools, MCP support via settings.json,
 * and `--output-format stream-json` for streaming JSON events.
 */

import { spawn, ChildProcess } from "child_process";
import { writeFile, mkdir, symlink, lstat } from "fs/promises";
import { getPeers } from "./mcp.js";

export interface GeminiCliRunnerOptions {
  message: string;
  systemPrompt: string;      // Written to ~/.gemini/GEMINI.md
  appendPrompt: string;      // Appended to GEMINI.md
  model?: string;            // default: "gemini-2.5-flash"
  maxTurns?: number;         // not a CLI flag — informational only
  sessionId?: string | null; // if truthy, pass --resume latest
  abortSignal?: AbortSignal;
  onLogEntry: (type: string, data: unknown) => void;
}

export interface GeminiCliRunnerResult {
  resultText: string;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Create a symlink if it doesn't already exist.
 * Gemini CLI restricts file tools to /workspace, so we symlink
 * /ledger and /shared into /workspace for access.
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
 * Write the system prompt to ~/.gemini/GEMINI.md.
 * Gemini CLI reads context from this file automatically.
 */
async function writeSystemPromptFile(systemPrompt: string, appendPrompt: string): Promise<void> {
  const home = process.env.HOME || "/home/agent";
  const geminiDir = `${home}/.gemini`;
  await mkdir(geminiDir, { recursive: true });

  let content = systemPrompt;
  if (appendPrompt) {
    content += "\n\n---\n\n" + appendPrompt;
  }

  await writeFile(`${geminiDir}/GEMINI.md`, content, "utf-8");
}

/**
 * Write MCP config to ~/.gemini/settings.json.
 * Points to our mcp-stdio.js as a stdio server — same one used by Claude CLI.
 */
async function writeMcpSettings(): Promise<void> {
  const home = process.env.HOME || "/home/agent";
  const geminiDir = `${home}/.gemini`;
  await mkdir(geminiDir, { recursive: true });

  const peers = getPeers();
  const agentId = process.env.AGENT_ID || "unknown";

  const env: Record<string, string> = {
    NEXUS_API_URL: process.env.NEXUS_API_URL || "http://host.docker.internal:3001",
    AGENT_ID: agentId,
    AGENT_NAME: process.env.AGENT_NAME || "Agent",
    NEXUS_PEERS: JSON.stringify(peers),
  };

  const settings = {
    mcpServers: {
      "nexus-intercom": {
        command: "node",
        args: ["/opt/engine/dist/mcp-stdio.js"],
        env,
      },
    },
  };

  await writeFile(`${geminiDir}/settings.json`, JSON.stringify(settings, null, 2), "utf-8");

  // Write initial peers file so the MCP stdio process can read it immediately
  await writeFile("/tmp/nexus-peers.json", JSON.stringify(peers), "utf-8");
}

/**
 * Runs the Gemini CLI with the given message and options.
 * Parses streaming JSON output line-by-line and normalizes events
 * to the format the dashboard expects.
 *
 * Gemini CLI stream-json events:
 *   init      — { type: "init", session_id, model, timestamp }
 *   message   — { type: "message", role: "user"|"assistant", content, delta?, timestamp }
 *   tool_use  — { type: "tool_use", tool_name, tool_id, parameters, timestamp }
 *   tool_result — { type: "tool_result", tool_id, status, output?, error?, timestamp }
 *   error     — { type: "error", severity, message, timestamp }
 *   result    — { type: "result", status, stats: { input_tokens, output_tokens, ... }, timestamp }
 */
export async function runGeminiCliAgent(options: GeminiCliRunnerOptions): Promise<GeminiCliRunnerResult> {
  // Pre-spawn setup: write system prompt and MCP config
  await writeSystemPromptFile(options.systemPrompt, options.appendPrompt);
  await writeMcpSettings();

  // Gemini CLI sandboxes built-in file tools to /workspace.
  // Symlink /ledger and /shared into /workspace so Gemini can access them.
  await ensureSymlink("/ledger", "/workspace/ledger");
  await ensureSymlink("/shared", "/workspace/shared");

  const args: string[] = [
    "-p", options.message,
    "--output-format", "stream-json",
    "--yolo",
    "-m", options.model || "gemini-2.5-flash",
  ];

  // Session resume — use "latest" since each container has its own session history
  if (options.sessionId) {
    args.push("--resume", "latest");
  }

  options.onLogEntry("cli_spawn", {
    args: args.map((a) =>
      a.length > 200 ? `${a.slice(0, 200)}... (${a.length} chars)` : a
    ),
    cwd: "/workspace",
    cellMode: "gemini",
  });

  let resultText = "";
  let assistantTextBuffer = "";  // Accumulate assistant deltas for final result
  let sessionId: string | null = options.sessionId || null;
  let inputTokens = 0;
  let outputTokens = 0;

  return new Promise<GeminiCliRunnerResult>((resolve, reject) => {
    const proc: ChildProcess = spawn("gemini", args, {
      cwd: "/workspace",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        HOME: process.env.HOME || "/home/agent",
      },
    });

    // Detect startup hang — if no stdout after 60s, log a warning
    let gotFirstOutput = false;
    const startupTimer = setTimeout(() => {
      if (!gotFirstOutput) {
        options.onLogEntry("cli_startup_slow", {
          message: "No output from gemini CLI after 60 seconds. Process may be hanging.",
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
        options.onLogEntry("cli_first_output", { message: "First output received from gemini CLI" });
      }

      stdoutBuffer += chunk.toString("utf-8");

      // Process complete lines
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          processGeminiEvent(event, options);

          // Extract session ID from init events
          if (event.type === "init" && event.session_id) {
            sessionId = event.session_id;
          }

          // Accumulate assistant message text for final result
          if (event.type === "message" && event.role === "assistant" && event.content) {
            if (event.delta) {
              assistantTextBuffer += event.content;
            } else {
              // Non-delta message replaces the buffer
              assistantTextBuffer = event.content;
            }
          }

          // Reset assistant buffer on tool_use (new turn starts)
          if (event.type === "tool_use") {
            assistantTextBuffer = "";
          }

          // Extract token usage and finalize result from result events
          if (event.type === "result") {
            if (event.status === "error" && event.error) {
              const err = event.error as Record<string, string>;
              resultText = err.message || "Gemini CLI error";
            } else {
              resultText = assistantTextBuffer || resultText;
            }
            const stats = event.stats as Record<string, number> | undefined;
            if (stats) {
              if (typeof stats.input_tokens === "number") {
                inputTokens += stats.input_tokens;
              }
              if (typeof stats.output_tokens === "number") {
                outputTokens += stats.output_tokens;
              }
            }
          }
        } catch {
          // Not JSON — log as raw output
          options.onLogEntry("cli_output", { raw: trimmed });
        }
      }
    });

    // Stream stderr in real-time for diagnostics
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
      reject(new Error(`Gemini CLI process error: ${err.message}`));
    });

    proc.on("exit", (code, signal) => {
      clearTimeout(startupTimer);

      // Process any remaining stdout
      if (stdoutBuffer.trim()) {
        try {
          const event = JSON.parse(stdoutBuffer.trim());
          processGeminiEvent(event, options);
          if (event.type === "result") {
            if (event.status !== "error") {
              resultText = assistantTextBuffer || resultText;
            }
            const stats = event.stats as Record<string, number> | undefined;
            if (stats) {
              if (typeof stats.input_tokens === "number") {
                inputTokens += stats.input_tokens;
              }
              if (typeof stats.output_tokens === "number") {
                outputTokens += stats.output_tokens;
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
        const errMsg = stderrBuffer.trim() || resultText || `Gemini CLI exited with code ${code}`;
        options.onLogEntry("cli_error", { code, stderr: stderrBuffer.trim(), resultError: resultText });
        reject(new Error(errMsg));
      } else {
        resolve({ resultText, sessionId, inputTokens, outputTokens });
      }
    });
  });
}

/**
 * Normalize a Gemini CLI stream-json event into the format the dashboard expects.
 * The dashboard expects messages in SDK-compatible format:
 *   { type: "system", subtype: "init", session_id }
 *   { type: "assistant", message: { content: [{type: "text", text}] } }
 *   { type: "assistant", message: { content: [{type: "tool_use", id, name, input}] } }
 *   { type: "user", message: { content: [{type: "tool_result", tool_use_id, content}] } }
 *   { type: "result", result, usage: { input_tokens, output_tokens } }
 */
function processGeminiEvent(
  event: Record<string, unknown>,
  options: GeminiCliRunnerOptions,
): void {
  switch (event.type) {
    case "init": {
      // Normalize to SDK init format
      options.onLogEntry("agent_message", {
        type: "system",
        subtype: "init",
        session_id: event.session_id,
        model: event.model,
      });
      break;
    }

    case "message": {
      if (event.role === "assistant") {
        // Accumulate assistant text — skip deltas for cleaner logs,
        // but still emit them so the dashboard can show streaming
        options.onLogEntry("agent_message", {
          type: "assistant",
          message: {
            content: [{ type: "text", text: event.content || "" }],
          },
          delta: event.delta || false,
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

    case "tool_use": {
      options.onLogEntry("agent_message", {
        type: "assistant",
        message: {
          content: [{
            type: "tool_use",
            id: event.tool_id,
            name: event.tool_name,
            input: event.parameters || {},
          }],
        },
      });
      break;
    }

    case "tool_result": {
      const resultContent = event.status === "error"
        ? JSON.stringify(event.error || "Tool execution failed")
        : (event.output || "");
      options.onLogEntry("agent_message", {
        type: "user",
        message: {
          content: [{
            type: "tool_result",
            tool_use_id: event.tool_id,
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
        severity: event.severity,
        message: event.message,
      });
      break;
    }

    case "result": {
      const stats = event.stats as Record<string, number> | undefined;
      options.onLogEntry("agent_message", {
        type: "result",
        result: "",
        is_error: event.status === "error",
        usage: stats ? {
          input_tokens: stats.input_tokens || 0,
          output_tokens: stats.output_tokens || 0,
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
