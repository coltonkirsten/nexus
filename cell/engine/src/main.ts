import express, { Request, Response } from "express";
import cors from "cors";
import { query } from "@anthropic-ai/claude-code";
import { readFile, readdir, stat, writeFile, unlink, appendFile, mkdir, rm, access, copyFile } from "fs/promises";
import { join, normalize, extname } from "path";
import { createNexusMcpServer, updatePeers, getPeers, type PeerAgent } from "./mcp.js";
import { runCliAgent } from "./cli-runner.js";
import { runGeminiCliAgent } from "./gemini-cli-runner.js";

// Cell mode: "sdk" (default), "cli", or "gemini"
const CELL_MODE = process.env.CELL_MODE || "sdk";

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv',
  '.mp3', '.wav', '.ogg', '.flac', '.aac',
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.exe', '.dll', '.so', '.dylib',
  '.bin', '.dat', '.db', '.sqlite',
]);

// Session persistence path
const SESSION_FILE_PATH = "/ledger/session_id";

// Constants
const SHUTDOWN_GRACE_PERIOD = 30000; // 30 seconds

// Types
interface MessageRequest {
  message: string;
  config?: AgentConfig;
  waitForResponse?: boolean;
}

interface AgentConfig {
  model?: string;
  maxTurns?: number;
  timeout?: number;       // seconds
  allowedTools?: string[];
}

interface SessionInfo {
  sessionId: string | null;
  persistenceEnabled: boolean;
  filePath: string;
}

interface LogEntry {
  timestamp: string;
  type: string;
  data: unknown;
}

interface SkillMetadata {
  name: string;
  description: string;
  path: string;
}

// In-memory log storage
const logs: LogEntry[] = [];
const LOG_RETENTION = parseInt(process.env.LOG_RETENTION || "1000", 10);
const LOG_PERSISTENCE_PATH = "/ledger/logs.jsonl";
const LOG_PERSISTENCE_ENABLED = process.env.LOG_PERSISTENCE === "true";

// Token usage tracking
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  invocationCount: number;
  sessionStartTime: string;
}

let tokenUsage: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  invocationCount: 0,
  sessionStartTime: new Date().toISOString(),
};

// Current session state
let currentSessionId: string | null = null;

// Task running state for graceful shutdown
let isTaskRunning = false;
let shutdownRequested = false;

// SSE clients for streaming
const sseClients: Set<Response> = new Set();

async function persistLogEntry(entry: LogEntry): Promise<void> {
  if (!LOG_PERSISTENCE_ENABLED) return;
  try {
    await appendFile(LOG_PERSISTENCE_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Silently fail if persistence is not available
  }
}

function addLog(type: string, data: unknown): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    type,
    data,
  };
  logs.push(entry);
  if (logs.length > LOG_RETENTION) {
    logs.shift();
  }
  // Broadcast to SSE clients
  broadcastToClients(entry);
  // Persist to file if enabled
  persistLogEntry(entry).catch(() => {});
}

function broadcastToClients(entry: LogEntry): void {
  const message = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

async function readFileIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function loadSessionId(): Promise<string | null> {
  try {
    const sessionId = await readFile(SESSION_FILE_PATH, "utf-8");
    return sessionId.trim() || null;
  } catch {
    return null;
  }
}

async function saveSessionId(sessionId: string): Promise<void> {
  await writeFile(SESSION_FILE_PATH, sessionId, "utf-8");
  addLog("session_saved", { sessionId });
}

async function clearSessionFile(): Promise<boolean> {
  try {
    await unlink(SESSION_FILE_PATH);
    currentSessionId = null;
    addLog("session_cleared", { filePath: SESSION_FILE_PATH });
    return true;
  } catch {
    // File might not exist, which is fine
    currentSessionId = null;
    return false;
  }
}

function parseFrontmatter(content: string): Record<string, string> {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return {};

  const frontmatter: Record<string, string> = {};
  const lines = frontmatterMatch[1].split("\n");
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }
  return frontmatter;
}

async function parseSkillsIndex(): Promise<SkillMetadata[]> {
  const skills: SkillMetadata[] = [];
  const skillsDir = "/ledger/skills";

  try {
    const entries = await readdir(skillsDir);
    for (const entry of entries) {
      const skillPath = join(skillsDir, entry);
      const skillStat = await stat(skillPath);
      if (skillStat.isDirectory()) {
        const skillFile = join(skillPath, "SKILL.md");
        const content = await readFileIfExists(skillFile);
        if (content) {
          const frontmatter = parseFrontmatter(content);
          skills.push({
            name: frontmatter.name || entry,
            description: frontmatter.description || "",
            path: skillPath,
          });
        }
      }
    }
  } catch {
    addLog("warning", "Could not read skills directory");
  }

  return skills;
}

async function assembleSystemPrompt(): Promise<{ systemPrompt: string; appendPrompt: string }> {
  // Read identity — stable across invocations, cached separately
  const identity = await readFileIfExists("/ledger/identity.md");
  const agentName = process.env.AGENT_NAME || "Agent";
  const nameHeader = `Your name is **${agentName}**.\n\n`;
  const systemPrompt = identity
    ? nameHeader + "# Identity\n\n" + identity
    : nameHeader + "You are an autonomous agent running in a NEXUS Cell. Complete tasks efficiently and report your progress.";

  // Read memory + skills — volatile, cached separately
  const appendParts: string[] = [];

  const memory = await readFileIfExists("/ledger/memory/index.md");
  if (memory) {
    appendParts.push("# Memory\n\n" + memory);
  }

  const skills = await parseSkillsIndex();
  if (skills.length > 0) {
    const skillsSection = skills
      .map((s) => `- **${s.name}**: ${s.description}`)
      .join("\n");
    appendParts.push("# Available Skills\n\n" + skillsSection);
  }

  // Add peer agents section if peers exist
  const peers = getPeers();
  const agentId = process.env.AGENT_ID || "unknown";
  const otherPeers = peers.filter((p) => p.id !== agentId);
  if (otherPeers.length > 0) {
    const peerLines = otherPeers
      .map((p) => `- **${p.name}** (${p.status})`)
      .join("\n");
    appendParts.push(
      "# NEXUS Peer Agents\n\n" +
      "You can communicate with other agents in the NEXUS network. " +
      "Use the `send_message` tool to send messages to them, and `list_agents` to see who is available.\n\n" +
      peerLines + "\n\n" +
      "A shared drive is mounted at `/shared` for exchanging files between agents. " +
      "Use `shared_write` and `shared_read` for mutex-protected file operations."
    );
  }

  // Add human mailbox section if agent is in a team
  if (process.env.TEAM_ID) {
    appendParts.push(
      "# Human Mailbox\n\n" +
      "You have access to a team mailbox for communicating with human operators. " +
      "Use the `send_human_mail` tool to send messages that require human attention — questions, approval requests, status updates, or deliverables. " +
      "Messages from humans will be delivered to you as regular messages prefixed with `[Human Mail]`."
    );
  }

  return {
    systemPrompt,
    appendPrompt: appendParts.join("\n\n---\n\n"),
  };
}

// Module-level abort controller for cancel support
let currentAbortController: AbortController | null = null;

async function runAgent(
  message: string,
  config: AgentConfig = {},
): Promise<string> {
  // Set task running state
  isTaskRunning = true;

  // Create abort controller for manual cancellation
  const abortController = new AbortController();
  currentAbortController = abortController;

  // Load existing session ID for persistence
  let resumeSessionId: string | null = null;
  resumeSessionId = await loadSessionId();
  if (resumeSessionId) {
    currentSessionId = resumeSessionId;
    addLog("session_loaded", { sessionId: resumeSessionId });
  }

  addLog("agent_start", {
    message,
    config,
    sessionPersistence: true,
    resumingSession: !!resumeSessionId,
  });

  try {
    const { systemPrompt, appendPrompt } = await assembleSystemPrompt();
    addLog("system_prompt_assembled", {
      systemPromptLength: systemPrompt.length,
      appendPromptLength: appendPrompt.length,
      preview: systemPrompt.slice(0, 200),
    });

    type ToolName = "Bash" | "Read" | "Write" | "Edit" | "Glob" | "Grep";
    const defaultTools: ToolName[] = ["Bash", "Read", "Write", "Edit", "Glob", "Grep"];
    const allowedTools: ToolName[] = config.allowedTools
      ? config.allowedTools.filter((t): t is ToolName => defaultTools.includes(t as ToolName))
      : defaultTools;

    // Track tokens for this invocation
    let invocationInputTokens = 0;
    let invocationOutputTokens = 0;
    let resultText = "";

    addLog("cell_mode", { mode: CELL_MODE });

    if (CELL_MODE === "cli") {
      // --- CLI mode: spawn the claude binary ---
      const cliOnLogEntry = (type: string, data: unknown) => {
        // Normalize CLI agent_message format to match SDK format
        // CLI outputs { type: "assistant", content: [...] } without the `message` wrapper
        // SDK outputs { type: "assistant", message: { content: [...] } }
        if (type === "agent_message" && data && typeof data === "object") {
          const msg = data as Record<string, unknown>;
          if (msg.type === "assistant" && Array.isArray(msg.content) && !msg.message) {
            msg.message = { content: msg.content };
          }
          if (msg.type === "user" && Array.isArray(msg.content) && !msg.message) {
            msg.message = { content: msg.content };
          }
        }
        addLog(type, data);

        // Extract session_id from system init messages (same as SDK path)
        if (
          data &&
          typeof data === "object" &&
          "type" in data &&
          (data as Record<string, unknown>).type === "system" &&
          "subtype" in data &&
          (data as Record<string, unknown>).subtype === "init" &&
          "session_id" in data &&
          typeof (data as Record<string, unknown>).session_id === "string"
        ) {
          const newSessionId = (data as Record<string, unknown>).session_id as string;
          if (newSessionId !== currentSessionId) {
            currentSessionId = newSessionId;
            saveSessionId(newSessionId).catch(() => {});
          }
        }
      };

      let cliResult;
      try {
        cliResult = await runCliAgent({
          message,
          systemPrompt,
          appendPrompt,
          model: config.model || "claude-haiku-4-5-20251001",
          maxTurns: config.maxTurns || 50,
          allowedTools: allowedTools as string[],
          sessionId: resumeSessionId,
          abortSignal: abortController.signal,
          onLogEntry: cliOnLogEntry,
        });
      } catch (cliErr) {
        // If session is stale, clear it and retry without resume
        const errMsg = cliErr instanceof Error ? cliErr.message : String(cliErr);
        if (resumeSessionId && errMsg.includes("No conversation found")) {
          addLog("session_stale", { sessionId: resumeSessionId, message: "Stale session detected, retrying without resume" });
          await clearSessionFile();
          cliResult = await runCliAgent({
            message,
            systemPrompt,
            appendPrompt,
            model: config.model || "claude-haiku-4-5-20251001",
            maxTurns: config.maxTurns || 50,
            allowedTools: allowedTools as string[],
            sessionId: null,
            abortSignal: abortController.signal,
            onLogEntry: cliOnLogEntry,
          });
        } else {
          throw cliErr;
        }
      }

      resultText = cliResult.resultText;
      invocationInputTokens = cliResult.inputTokens;
      invocationOutputTokens = cliResult.outputTokens;
      tokenUsage.inputTokens += cliResult.inputTokens;
      tokenUsage.outputTokens += cliResult.outputTokens;
      tokenUsage.totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;

      if (cliResult.sessionId && cliResult.sessionId !== currentSessionId) {
        currentSessionId = cliResult.sessionId;
        await saveSessionId(cliResult.sessionId);
      }
    } else if (CELL_MODE === "gemini") {
      // --- Gemini CLI mode: spawn the gemini binary ---
      const geminiOnLogEntry = (type: string, data: unknown) => {
        // Normalize Gemini CLI event format to match SDK format (same as CLI mode)
        if (type === "agent_message" && data && typeof data === "object") {
          const msg = data as Record<string, unknown>;
          if (msg.type === "assistant" && Array.isArray(msg.content) && !msg.message) {
            msg.message = { content: msg.content };
          }
          if (msg.type === "user" && Array.isArray(msg.content) && !msg.message) {
            msg.message = { content: msg.content };
          }
        }
        addLog(type, data);

        // Extract session_id from system init messages
        if (
          data &&
          typeof data === "object" &&
          "type" in data &&
          (data as Record<string, unknown>).type === "system" &&
          "subtype" in data &&
          (data as Record<string, unknown>).subtype === "init" &&
          "session_id" in data &&
          typeof (data as Record<string, unknown>).session_id === "string"
        ) {
          const newSessionId = (data as Record<string, unknown>).session_id as string;
          if (newSessionId !== currentSessionId) {
            currentSessionId = newSessionId;
            saveSessionId(newSessionId).catch(() => {});
          }
        }
      };

      let geminiResult;
      try {
        geminiResult = await runGeminiCliAgent({
          message,
          systemPrompt,
          appendPrompt,
          model: config.model || "gemini-2.5-flash",
          maxTurns: config.maxTurns || 50,
          sessionId: resumeSessionId,
          abortSignal: abortController.signal,
          onLogEntry: geminiOnLogEntry,
        });
      } catch (geminiErr) {
        // If session is stale, clear it and retry without resume
        const errMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        if (resumeSessionId && (errMsg.includes("session") || errMsg.includes("resume"))) {
          addLog("session_stale", { sessionId: resumeSessionId, message: "Stale session detected, retrying without resume" });
          await clearSessionFile();
          geminiResult = await runGeminiCliAgent({
            message,
            systemPrompt,
            appendPrompt,
            model: config.model || "gemini-2.5-flash",
            maxTurns: config.maxTurns || 50,
            sessionId: null,
            abortSignal: abortController.signal,
            onLogEntry: geminiOnLogEntry,
          });
        } else {
          throw geminiErr;
        }
      }

      resultText = geminiResult.resultText;
      invocationInputTokens = geminiResult.inputTokens;
      invocationOutputTokens = geminiResult.outputTokens;
      tokenUsage.inputTokens += geminiResult.inputTokens;
      tokenUsage.outputTokens += geminiResult.outputTokens;
      tokenUsage.totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;

      if (geminiResult.sessionId && geminiResult.sessionId !== currentSessionId) {
        currentSessionId = geminiResult.sessionId;
        await saveSessionId(geminiResult.sessionId);
      }
    } else {
      // --- SDK mode: use the Anthropic Agent SDK ---

      // Create the NEXUS MCP server for inter-agent communication
      const nexusMcp = createNexusMcpServer();

      // Build query options — split system prompt for optimal cache behavior:
      // customSystemPrompt (identity) is stable and stays cached across invocations
      // appendSystemPrompt (memory + skills) is volatile and re-cached independently
      const queryOptions: Record<string, unknown> = {
        customSystemPrompt: systemPrompt,
        ...(appendPrompt && { appendSystemPrompt: appendPrompt }),
        allowedTools,
        permissionMode: "bypassPermissions",
        model: config.model || "claude-haiku-4-5-20251001",
        maxTurns: config.maxTurns || 50,
        cwd: "/workspace",
        abortSignal: abortController.signal,
        mcpServers: { "nexus-intercom": nexusMcp },
      };

      // Add resume option if we have a session to resume
      if (resumeSessionId) {
        queryOptions.resume = resumeSessionId;
      }

      // Create the agent task promise
      const agentTask = async () => {
        for await (const agentMessage of query({
          prompt: message,
          options: queryOptions,
        })) {
          addLog("agent_message", agentMessage);

          // Extract token usage from result messages
          if (
            agentMessage &&
            typeof agentMessage === "object" &&
            "type" in agentMessage &&
            agentMessage.type === "result" &&
            "usage" in agentMessage &&
            agentMessage.usage &&
            typeof agentMessage.usage === "object"
          ) {
            const usage = agentMessage.usage as { input_tokens?: number; output_tokens?: number };
            if (typeof usage.input_tokens === "number") {
              invocationInputTokens += usage.input_tokens;
              tokenUsage.inputTokens += usage.input_tokens;
            }
            if (typeof usage.output_tokens === "number") {
              invocationOutputTokens += usage.output_tokens;
              tokenUsage.outputTokens += usage.output_tokens;
            }
            tokenUsage.totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;

            // Extract result text
            if ("result" in agentMessage && typeof agentMessage.result === "string") {
              resultText = agentMessage.result;
            }
          }

          // Extract session_id from system init messages
          if (
            agentMessage &&
            typeof agentMessage === "object" &&
            "type" in agentMessage &&
            agentMessage.type === "system" &&
            "subtype" in agentMessage &&
            agentMessage.subtype === "init" &&
            "session_id" in agentMessage &&
            typeof agentMessage.session_id === "string"
          ) {
            const newSessionId = agentMessage.session_id;
            if (newSessionId !== currentSessionId) {
              currentSessionId = newSessionId;
              await saveSessionId(newSessionId);
            }
          }
        }
      };

      await agentTask();
    }

    // Update invocation count
    tokenUsage.invocationCount++;

    // Log token usage for this invocation
    addLog("token_usage", {
      invocation: {
        inputTokens: invocationInputTokens,
        outputTokens: invocationOutputTokens,
        totalTokens: invocationInputTokens + invocationOutputTokens,
      },
      cumulative: {
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
        invocationCount: tokenUsage.invocationCount,
      },
    });

    addLog("agent_complete", {
      success: true,
      sessionId: currentSessionId,
      sessionPersistence: true
    });

    return resultText;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const isAborted = errorMessage.includes("aborted") || abortController.signal.aborted;

    addLog("agent_error", {
      error: errorMessage,
      isAborted,
      recovered: true
    });

    // Don't rethrow - return to idle state for error recovery
    addLog("agent_recovered", {
      message: "Agent returned to idle state after error"
    });
    return "";
  } finally {
    // Always reset task running state and clear abort controller
    isTaskRunning = false;
    currentAbortController = null;

    // If shutdown was requested while task was running, exit now
    if (shutdownRequested) {
      addLog("shutdown_after_task", {
        message: "Task completed, proceeding with shutdown"
      });
      process.exit(0);
    }
  }
}

// Express app setup
const app = express();
app.use(cors());
app.use(express.json());

// Health endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Init endpoint — seed ledger from template data (idempotent)
app.post("/init", async (req: Request, res: Response) => {
  try {
    // Check if already initialized (identity.md exists)
    const existing = await readFileIfExists("/ledger/identity.md");
    if (existing) {
      res.json({ initialized: false, reason: "already initialized" });
      return;
    }

    const { identity, memory, skills } = req.body as {
      identity?: string;
      memory?: string;
      skills?: Array<{ name: string; content: string }>;
    };

    // Write identity
    if (identity) {
      await writeFile("/ledger/identity.md", identity, "utf-8");
    }

    // Write memory
    if (memory) {
      await mkdir("/ledger/memory", { recursive: true });
      await writeFile("/ledger/memory/index.md", memory, "utf-8");
    }

    // Write skills
    if (skills && skills.length > 0) {
      for (const skill of skills) {
        const skillDir = `/ledger/skills/${skill.name}`;
        await mkdir(skillDir, { recursive: true });
        await writeFile(`${skillDir}/SKILL.md`, skill.content, "utf-8");
      }
    }

    addLog("init_complete", {
      identity: !!identity,
      memory: !!memory,
      skillCount: skills?.length || 0,
    });

    res.json({ initialized: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    addLog("init_error", { error: msg });
    res.status(500).json({ error: `Init failed: ${msg}` });
  }
});

// SSE endpoint for streaming logs
app.get("/logs", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Send existing logs
  for (const log of logs) {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  }

  // Add client to SSE set
  sseClients.add(res);

  // Heartbeat to keep the connection alive through NAT/proxies when no logs are flowing
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25000);

  // Remove client on disconnect
  req.on("close", () => {
    sseClients.delete(res);
    clearInterval(heartbeat);
  });
});

// Get logs (non-streaming)
app.get("/logs/history", (_req: Request, res: Response) => {
  res.json(logs);
});

// Get log statistics
app.get("/logs/stats", (_req: Request, res: Response) => {
  const logCount = logs.length;
  const oldestTimestamp = logs.length > 0 ? logs[0].timestamp : null;
  const newestTimestamp = logs.length > 0 ? logs[logs.length - 1].timestamp : null;

  res.json({
    count: logCount,
    retention: LOG_RETENTION,
    persistenceEnabled: LOG_PERSISTENCE_ENABLED,
    persistencePath: LOG_PERSISTENCE_PATH,
    oldestTimestamp,
    newestTimestamp,
  });
});

// List log archives
app.get("/logs/archives", async (_req: Request, res: Response) => {
  try {
    const archiveDir = '/ledger/logs-archive';
    try {
      const files = await readdir(archiveDir);
      const archives = files
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .reverse(); // Most recent first
      res.json({ archives });
    } catch {
      // Directory doesn't exist
      res.json({ archives: [] });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to list archives' });
  }
});

// Read a specific log archive
app.get("/logs/archives/:filename", async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    // Sanitize filename to prevent path traversal
    if (filename.includes('/') || filename.includes('..')) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    const archivePath = `/ledger/logs-archive/${filename}`;
    const content = await readFile(archivePath, 'utf-8');
    const archiveLogs = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    res.json({ logs: archiveLogs });
  } catch {
    res.status(404).json({ error: 'Archive not found' });
  }
});

// Get token usage
app.get("/tokens", (_req: Request, res: Response) => {
  res.json({
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    totalTokens: tokenUsage.totalTokens,
    invocationCount: tokenUsage.invocationCount,
    sessionStartTime: tokenUsage.sessionStartTime,
  });
});

// Get system prompt components
app.get("/system-prompt", async (_req: Request, res: Response) => {
  try {
    const identity = await readFileIfExists("/ledger/identity.md");
    const memory = await readFileIfExists("/ledger/memory/index.md");
    const skills = await parseSkillsIndex();
    const { systemPrompt, appendPrompt } = await assembleSystemPrompt();

    // Join both parts for display so the dashboard shows the full prompt
    const assembled = [systemPrompt, appendPrompt].filter(Boolean).join("\n\n---\n\n");

    res.json({
      assembled,
      identity: identity || "",
      memory: memory || "",
      skills,
    });
  } catch {
    res.status(500).json({ error: "Failed to get system prompt" });
  }
});

// Message endpoint
app.post("/message", async (req: Request, res: Response) => {
  const { message, config, waitForResponse } = req.body as MessageRequest;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  // Check for required credentials based on cell mode
  if (CELL_MODE === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: "GEMINI_API_KEY not configured. Add it in Settings → Credentials." });
      return;
    }
  } else if (CELL_MODE === "cli") {
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
      res.status(500).json({ error: "CLI mode requires CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY" });
      return;
    }
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
      return;
    }
  }

  // Log OAuth token usage for CLI agents
  if (CELL_MODE === "cli") {
    const authMethod = process.env.CLAUDE_CODE_OAUTH_TOKEN
      ? "oauth_token"
      : "api_key";
    addLog("cli_auth_method", { method: authMethod });
  }

  // Reject if a task is already running
  if (isTaskRunning) {
    res.status(409).json({
      error: "Agent is busy",
      message: "A task is already running. Wait for it to complete before sending another message."
    });
    return;
  }

  if (waitForResponse) {
    // Synchronous mode: await the agent and return the result
    try {
      const result = await runAgent(message, config);
      res.json({
        status: "completed",
        response: result,
        sessionPersistence: true,
      });
    } catch (error) {
      addLog("agent_fatal_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    // Fire-and-forget mode (default)
    res.json({
      status: "started",
      message: "Agent task started. Monitor /logs for progress.",
      sessionPersistence: true,
    });

    // Run agent (don't await - let it run in background)
    runAgent(message, config).catch((error) => {
      addLog("agent_fatal_error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
});

// Get current session info
app.get("/session", async (_req: Request, res: Response) => {
  try {
    const storedSessionId = await loadSessionId();
    const sessionInfo: SessionInfo = {
      sessionId: currentSessionId || storedSessionId,
      persistenceEnabled: true,
      filePath: SESSION_FILE_PATH,
    };
    res.json(sessionInfo);
  } catch (error) {
    res.status(500).json({
      error: "Failed to get session info",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Clear session file
app.post("/session/clear", async (_req: Request, res: Response) => {
  try {
    // Archive logs before clearing if persistence is enabled
    let archivedTo: string | null = null;
    if (LOG_PERSISTENCE_ENABLED) {
      try {
        // Create archive directory
        await mkdir('/ledger/logs-archive', { recursive: true });

        // Generate archive filename with timestamp
        const archiveTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = `/ledger/logs-archive/logs-${archiveTimestamp}.jsonl`;

        // Check if main log file exists before copying
        try {
          await access(LOG_PERSISTENCE_PATH);
          await copyFile(LOG_PERSISTENCE_PATH, archivePath);
          archivedTo = archivePath;
        } catch {
          // No log file to archive, that's fine
        }

        // Clear the main log file (truncate)
        await writeFile(LOG_PERSISTENCE_PATH, '');

        // Add the session_cleared event to the fresh log
        const clearEvent = {
          timestamp: new Date().toISOString(),
          type: 'session_cleared',
          data: {
            archivedTo: archivePath,
            previousSessionId: currentSessionId
          }
        };
        await appendFile(LOG_PERSISTENCE_PATH, JSON.stringify(clearEvent) + '\n');

      } catch (archiveError) {
        // Best-effort archival - log but don't fail the clear
        console.error('Failed to archive logs:', archiveError);
      }
    }

    const existed = await clearSessionFile();
    // Clear in-memory logs so SSE replays an empty array on reconnect
    logs.length = 0;
    res.json({
      success: true,
      message: existed
        ? "Session cleared successfully"
        : "No session file existed",
      sessionId: null,
      archivedTo,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to clear session",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /peers - Update peer agent list (called by NEXUS API)
app.post("/peers", (req: Request, res: Response) => {
  const { peers } = req.body as { peers?: PeerAgent[] };
  if (!Array.isArray(peers)) {
    res.status(400).json({ error: "peers array is required" });
    return;
  }
  updatePeers(peers);
  addLog("peers_updated", { count: peers.length });
  res.json({ success: true, count: peers.length });
});

// POST /cancel - Cancel the currently running task
app.post("/cancel", (_req: Request, res: Response) => {
  if (currentAbortController && isTaskRunning) {
    addLog("task_cancelled", { message: "Task cancelled by user" });
    currentAbortController.abort();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "No task running" });
  }
});

// --- Filesystem API ---

const ALLOWED_ROOTS = ["/ledger", "/workspace", "/shared"];

function validatePath(requestedPath: string): { valid: boolean; resolved: string; error?: string } {
  const resolved = normalize(requestedPath);

  if (resolved.includes("..")) {
    return { valid: false, resolved, error: "Path traversal not allowed" };
  }

  const isAllowed = ALLOWED_ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + "/")
  );
  if (!isAllowed) {
    return { valid: false, resolved, error: `Path must be under ${ALLOWED_ROOTS.join(" or ")}` };
  }

  return { valid: true, resolved };
}

interface DirectoryEntry {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  children?: DirectoryEntry[];
}

async function listDirectoryRecursive(dirPath: string): Promise<DirectoryEntry[]> {
  const entries: DirectoryEntry[] = [];
  try {
    const items = await readdir(dirPath);
    for (const item of items) {
      const fullPath = join(dirPath, item);
      const itemStat = await stat(fullPath);
      if (itemStat.isDirectory()) {
        const children = await listDirectoryRecursive(fullPath);
        entries.push({ name: item, type: "directory", path: fullPath, children });
      } else {
        entries.push({ name: item, type: "file", path: fullPath, size: itemStat.size });
      }
    }
  } catch {
    // Directory might not exist
  }
  return entries;
}

// GET /files/list - List directory contents
app.get("/files/list", async (req: Request, res: Response) => {
  const dirPath = req.query.path as string;
  if (!dirPath) {
    res.status(400).json({ error: "path query parameter required" });
    return;
  }

  const validation = validatePath(dirPath);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const entries = await listDirectoryRecursive(validation.resolved);
    res.json({ path: validation.resolved, entries });
  } catch {
    res.status(500).json({ error: "Failed to list directory" });
  }
});

// GET /files/read - Read file content
app.get("/files/read", async (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ error: "path query parameter required" });
    return;
  }

  const validation = validatePath(filePath);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const fileStat = await stat(validation.resolved);
    const isBinary = BINARY_EXTENSIONS.has(extname(validation.resolved).toLowerCase());

    if (isBinary) {
      const buffer = await readFile(validation.resolved);
      res.json({
        path: validation.resolved,
        content: buffer.toString("base64"),
        encoding: "base64",
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
      });
    } else {
      const content = await readFile(validation.resolved, "utf-8");
      res.json({
        path: validation.resolved,
        content,
        encoding: "utf-8",
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
      });
    }
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// PUT /files/write - Write/create file
app.put("/files/write", async (req: Request, res: Response) => {
  const { path: filePath, content } = req.body as { path?: string; content?: string };
  if (!filePath || content === undefined) {
    res.status(400).json({ error: "path and content are required" });
    return;
  }

  const validation = validatePath(filePath);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    // Ensure parent directory exists
    const parentDir = join(validation.resolved, "..");
    await mkdir(parentDir, { recursive: true });
    await writeFile(validation.resolved, content, "utf-8");
    res.json({ success: true, path: validation.resolved });
  } catch (error) {
    res.status(500).json({ error: "Failed to write file" });
  }
});

// DELETE /files/delete - Delete file or directory
app.delete("/files/delete", async (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ error: "path query parameter required" });
    return;
  }

  const validation = validatePath(filePath);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  // Prevent deleting root directories
  if (ALLOWED_ROOTS.includes(validation.resolved)) {
    res.status(400).json({ error: "Cannot delete root directories" });
    return;
  }

  try {
    const fileStat = await stat(validation.resolved);
    if (fileStat.isDirectory()) {
      await rm(validation.resolved, { recursive: true });
    } else {
      await unlink(validation.resolved);
    }
    res.json({ success: true });
  } catch {
    res.status(404).json({ error: "File or directory not found" });
  }
});

// POST /files/mkdir - Create directory
app.post("/files/mkdir", async (req: Request, res: Response) => {
  const { path: dirPath } = req.body as { path?: string };
  if (!dirPath) {
    res.status(400).json({ error: "path is required" });
    return;
  }

  const validation = validatePath(dirPath);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    await mkdir(validation.resolved, { recursive: true });
    res.json({ success: true, path: validation.resolved });
  } catch {
    res.status(500).json({ error: "Failed to create directory" });
  }
});

// --- Skills API (directory-per-skill: /ledger/skills/{name}/SKILL.md) ---

// GET /skills - List all skills with parsed metadata
app.get("/skills", async (_req: Request, res: Response) => {
  try {
    const skills = await parseSkillsIndex();
    res.json({ skills });
  } catch {
    res.status(500).json({ error: "Failed to list skills" });
  }
});

// GET /skills/:name - Get a specific skill
app.get("/skills/:name", async (req: Request, res: Response) => {
  const { name } = req.params;
  const skillFile = join("/ledger/skills", name, "SKILL.md");

  try {
    const content = await readFile(skillFile, "utf-8");
    const frontmatter = parseFrontmatter(content);
    res.json({
      name: frontmatter.name || name,
      description: frontmatter.description || "",
      path: join("/ledger/skills", name),
      content,
    });
  } catch {
    res.status(404).json({ error: "Skill not found" });
  }
});

// PUT /skills/:name - Create or update a skill
app.put("/skills/:name", async (req: Request, res: Response) => {
  const { name } = req.params;
  const { content } = req.body as { content?: string };

  if (content === undefined) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const skillDir = join("/ledger/skills", name);
  const skillFile = join(skillDir, "SKILL.md");

  try {
    await mkdir(skillDir, { recursive: true });
    await writeFile(skillFile, content, "utf-8");
    const frontmatter = parseFrontmatter(content);
    res.json({
      name: frontmatter.name || name,
      description: frontmatter.description || "",
      path: skillDir,
      content,
    });
  } catch {
    res.status(500).json({ error: "Failed to save skill" });
  }
});

// DELETE /skills/:name - Delete a skill
app.delete("/skills/:name", async (req: Request, res: Response) => {
  const { name } = req.params;
  const skillDir = join("/ledger/skills", name);

  try {
    await rm(skillDir, { recursive: true });
    res.json({ success: true });
  } catch {
    res.status(404).json({ error: "Skill not found" });
  }
});

// Start server
const PORT = parseInt(process.env.ENGINE_PORT || "3100", 10);

const server = app.listen(PORT, () => {
  console.log(`NEXUS Cell Engine started on port ${PORT}`);
  addLog("server_start", { port: PORT });
});

// Graceful shutdown handler
function handleShutdown(signal: string): void {
  addLog("shutdown_requested", {
    signal,
    taskRunning: isTaskRunning,
    message: isTaskRunning
      ? `Shutdown requested, waiting for task to complete (max ${SHUTDOWN_GRACE_PERIOD}ms)`
      : "Shutting down immediately"
  });
  console.log(`Received ${signal}, initiating graceful shutdown...`);

  shutdownRequested = true;

  // Close the HTTP server to stop accepting new connections
  server.close(() => {
    addLog("server_closed", { message: "HTTP server closed" });
  });

  // Close all SSE connections
  for (const client of sseClients) {
    client.end();
  }
  sseClients.clear();

  if (isTaskRunning) {
    // Wait for task to complete, with a maximum timeout
    const shutdownTimeout = setTimeout(() => {
      addLog("shutdown_timeout", {
        message: `Forced shutdown after ${SHUTDOWN_GRACE_PERIOD}ms grace period`
      });
      console.log("Forced shutdown after grace period");
      process.exit(1);
    }, SHUTDOWN_GRACE_PERIOD);

    // The task's finally block will call process.exit(0) when it completes
    // Clear the timeout reference to prevent it from keeping the process alive
    shutdownTimeout.unref();
  } else {
    // No task running, exit immediately
    addLog("shutdown_complete", { message: "Clean shutdown" });
    console.log("Clean shutdown complete");
    process.exit(0);
  }
}

// Register signal handlers
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
