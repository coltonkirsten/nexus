/**
 * CLI Runner — spawns the `claude` binary to handle agent messages.
 * Used when CELL_MODE=cli.
 */

import { spawn, ChildProcess } from "child_process";
import { writeFile, mkdir } from "fs/promises";
import { getPeers } from "./mcp.js";

export interface CliRunnerOptions {
  message: string;
  systemPrompt: string;
  appendPrompt: string;
  model?: string;
  maxTurns?: number;
  allowedTools?: string[];
  sessionId?: string | null;
  abortSignal?: AbortSignal;
  onLogEntry: (type: string, data: unknown) => void;
}

export interface CliRunnerResult {
  resultText: string;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Write the MCP config JSON file for the claude CLI.
 * Points to our mcp-stdio.js as a stdio server.
 */
async function writeMcpConfig(): Promise<string | null> {
  const peers = getPeers();
  const agentId = process.env.AGENT_ID || "unknown";

  const configPath = "/tmp/nexus-mcp-config.json";

  // Serialize peers into env for the MCP server
  const env: Record<string, string> = {
    NEXUS_API_URL: process.env.NEXUS_API_URL || "http://host.docker.internal:3001",
    AGENT_ID: agentId,
    AGENT_NAME: process.env.AGENT_NAME || "Agent",
    NEXUS_PEERS: JSON.stringify(peers),
  };

  const config = {
    mcpServers: {
      "nexus-intercom": {
        command: "node",
        args: ["/opt/engine/dist/mcp-stdio.js"],
        env,
      },
    },
  };

  await mkdir("/tmp", { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  return configPath;
}

/**
 * Runs the claude CLI with the given message and options.
 * Parses streaming JSON output line-by-line.
 */
export async function runCliAgent(options: CliRunnerOptions): Promise<CliRunnerResult> {
  const mcpConfigPath = await writeMcpConfig();

  const args: string[] = [
    "-p", options.message,
    "--output-format", "stream-json",
    "--verbose",
    "--model", options.model || "claude-haiku-4-5-20251001",
    "--dangerously-skip-permissions",
  ];

  if (mcpConfigPath) {
    args.push("--mcp-config", mcpConfigPath);
  }

  // System prompt via --system-prompt flag
  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }

  // Append prompt
  if (options.appendPrompt) {
    args.push("--append-system-prompt", options.appendPrompt);
  }

  // Session resume
  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }

  // Allowed tools — space-separated list
  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push("--allowedTools", ...options.allowedTools);
  }

  options.onLogEntry("cli_spawn", {
    args: args.map((a) =>
      // Truncate long args in logs for readability
      a.length > 200 ? `${a.slice(0, 200)}... (${a.length} chars)` : a
    ),
    cwd: "/workspace",
    mcpConfigPath,
    cellMode: "cli",
  });

  let resultText = "";
  let sessionId: string | null = options.sessionId || null;
  let inputTokens = 0;
  let outputTokens = 0;

  return new Promise<CliRunnerResult>((resolve, reject) => {
    const proc: ChildProcess = spawn("claude", args, {
      cwd: "/workspace",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Ensure HOME is set for claude CLI config
        HOME: process.env.HOME || "/home/agent",
      },
    });

    // Detect startup hang — if no stdout after 60s, log a warning
    let gotFirstOutput = false;
    const startupTimer = setTimeout(() => {
      if (!gotFirstOutput) {
        options.onLogEntry("cli_startup_slow", {
          message: "No output from claude CLI after 60 seconds. Process may be hanging.",
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
        options.onLogEntry("cli_first_output", { message: "First output received from claude CLI" });
      }

      stdoutBuffer += chunk.toString("utf-8");

      // Process complete lines
      const lines = stdoutBuffer.split("\n");
      // Keep the last incomplete line in the buffer
      stdoutBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const msg = JSON.parse(trimmed);
          options.onLogEntry("agent_message", msg);

          // Extract session ID from system/init messages
          if (msg.type === "system" && msg.subtype === "init" && msg.session_id) {
            sessionId = msg.session_id;
          }

          // Extract result text and token usage from result messages
          if (msg.type === "result") {
            if (msg.result) {
              resultText = msg.result;
            }
            // Capture error messages from result for better error reporting
            if (msg.is_error && Array.isArray(msg.errors) && msg.errors.length > 0) {
              resultText = msg.errors.join("; ");
            }
            if (msg.usage) {
              if (typeof msg.usage.input_tokens === "number") {
                inputTokens += msg.usage.input_tokens;
              }
              if (typeof msg.usage.output_tokens === "number") {
                outputTokens += msg.usage.output_tokens;
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
      // Log each stderr line in real-time to both SSE and container stdout
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
      reject(new Error(`CLI process error: ${err.message}`));
    });

    proc.on("exit", (code, signal) => {
      clearTimeout(startupTimer);

      // Process any remaining stdout
      if (stdoutBuffer.trim()) {
        try {
          const msg = JSON.parse(stdoutBuffer.trim());
          options.onLogEntry("agent_message", msg);
          if (msg.type === "result" && msg.result) {
            resultText = msg.result;
          }
        } catch {
          options.onLogEntry("cli_output", { raw: stdoutBuffer.trim() });
        }
      }

      options.onLogEntry("cli_exit", { code, signal, stderrLength: stderrBuffer.length });

      if (signal === "SIGTERM") {
        // Aborted by us
        resolve({ resultText, sessionId, inputTokens, outputTokens });
      } else if (code !== 0) {
        const errMsg = stderrBuffer.trim() || resultText || `CLI exited with code ${code}`;
        options.onLogEntry("cli_error", { code, stderr: stderrBuffer.trim(), resultError: resultText });
        reject(new Error(errMsg));
      } else {
        resolve({ resultText, sessionId, inputTokens, outputTokens });
      }
    });
  });
}
