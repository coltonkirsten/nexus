import express, { Request, Response } from "express";
import cors from "cors";
import { query } from "@anthropic-ai/claude-code";
import { readFile, readdir, stat, writeFile, unlink, appendFile, mkdir, rm } from "fs/promises";
import { join, normalize } from "path";

// Session persistence path
const SESSION_FILE_PATH = "/ledger/session_id";

// Constants
const DEFAULT_TASK_TIMEOUT = 600000; // 10 minutes
const SHUTDOWN_GRACE_PERIOD = 30000; // 30 seconds

// Types
interface MessageRequest {
  message: string;
  config?: AgentConfig;
  sessionPersistence?: boolean;
  timeout?: number; // Task timeout in milliseconds
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
let sessionPersistenceEnabled = false;

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

async function assembleSystemPrompt(): Promise<string> {
  const parts: string[] = [];

  // Read identity
  const identity = await readFileIfExists("/ledger/identity.md");
  if (identity) {
    parts.push("# Identity\n\n" + identity);
  }

  // Read memory index
  const memory = await readFileIfExists("/ledger/memory/index.md");
  if (memory) {
    parts.push("# Memory\n\n" + memory);
  }

  // Parse skills
  const skills = await parseSkillsIndex();
  if (skills.length > 0) {
    const skillsSection = skills
      .map((s) => `- **${s.name}**: ${s.description}`)
      .join("\n");
    parts.push("# Available Skills\n\n" + skillsSection);
  }

  if (parts.length === 0) {
    return "You are an autonomous agent running in a NEXUS Cell. Complete tasks efficiently and report your progress.";
  }

  return parts.join("\n\n---\n\n");
}

// Create a timeout promise for task enforcement
function createTimeoutPromise(timeoutMs: number, abortController: AbortController): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      abortController.abort();
      reject(new Error(`Task timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

async function runAgent(
  message: string,
  config: AgentConfig = {},
  sessionPersistence: boolean = false,
  taskTimeout: number = DEFAULT_TASK_TIMEOUT
): Promise<string> {
  // Set task running state
  isTaskRunning = true;
  sessionPersistenceEnabled = sessionPersistence;

  // Create abort controller for timeout
  const abortController = new AbortController();

  // Load existing session ID if persistence is enabled
  let resumeSessionId: string | null = null;
  if (sessionPersistence) {
    resumeSessionId = await loadSessionId();
    if (resumeSessionId) {
      currentSessionId = resumeSessionId;
      addLog("session_loaded", { sessionId: resumeSessionId });
    }
  }

  addLog("agent_start", {
    message,
    config,
    sessionPersistence,
    resumingSession: !!resumeSessionId,
    timeout: taskTimeout
  });

  try {
    const systemPrompt = await assembleSystemPrompt();
    addLog("system_prompt_assembled", {
      length: systemPrompt.length,
      preview: systemPrompt.slice(0, 200),
    });

    type ToolName = "Bash" | "Read" | "Write" | "Edit" | "Glob" | "Grep";
    const defaultTools: ToolName[] = ["Bash", "Read", "Write", "Edit", "Glob", "Grep"];
    const allowedTools: ToolName[] = config.allowedTools
      ? config.allowedTools.filter((t): t is ToolName => defaultTools.includes(t as ToolName))
      : defaultTools;

    // Build query options
    const queryOptions: Record<string, unknown> = {
      customSystemPrompt: systemPrompt,
      allowedTools,
      permissionMode: "bypassPermissions",
      model: config.model || "claude-sonnet-4-5-20250929",
      maxTurns: config.maxTurns || 50,
      cwd: "/workspace",
      abortSignal: abortController.signal,
    };

    // Add resume option if we have a session to resume
    if (sessionPersistence && resumeSessionId) {
      queryOptions.resume = resumeSessionId;
    }

    // Track tokens for this invocation
    let invocationInputTokens = 0;
    let invocationOutputTokens = 0;
    let resultText = "";

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
          sessionPersistence &&
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

    // Race between task completion and timeout
    await Promise.race([
      agentTask(),
      createTimeoutPromise(taskTimeout, abortController)
    ]);

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
      sessionPersistence
    });

    return resultText;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes("timed out");
    const isAborted = errorMessage.includes("aborted") || abortController.signal.aborted;

    addLog("agent_error", {
      error: errorMessage,
      isTimeout,
      isAborted,
      recovered: true
    });

    // Log specific error types for better debugging
    if (isTimeout) {
      addLog("task_timeout", {
        timeout: taskTimeout,
        message: `Task exceeded timeout of ${taskTimeout}ms`
      });
    }

    // Don't rethrow - return to idle state for error recovery
    addLog("agent_recovered", {
      message: "Agent returned to idle state after error"
    });
    return "";
  } finally {
    // Always reset task running state
    isTaskRunning = false;

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

  // Remove client on disconnect
  req.on("close", () => {
    sseClients.delete(res);
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
    const assembled = await assembleSystemPrompt();

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
  const { message, config, sessionPersistence, timeout, waitForResponse } = req.body as MessageRequest;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  // Use provided timeout (ms), or config timeout (seconds → ms), or default
  const taskTimeout = typeof timeout === "number" && timeout > 0
    ? timeout
    : config?.timeout && config.timeout > 0
      ? config.timeout * 1000
      : DEFAULT_TASK_TIMEOUT;

  if (waitForResponse) {
    // Synchronous mode: await the agent and return the result
    try {
      const result = await runAgent(message, config, !!sessionPersistence, taskTimeout);
      res.json({
        status: "completed",
        response: result,
        sessionPersistence: !!sessionPersistence,
        timeout: taskTimeout,
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
      sessionPersistence: !!sessionPersistence,
      timeout: taskTimeout,
    });

    // Run agent (don't await - let it run in background)
    runAgent(message, config, !!sessionPersistence, taskTimeout).catch((error) => {
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
      persistenceEnabled: sessionPersistenceEnabled,
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
    const existed = await clearSessionFile();
    res.json({
      success: true,
      message: existed
        ? "Session cleared successfully"
        : "No session file existed",
      sessionId: null,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to clear session",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// --- Filesystem API ---

const ALLOWED_ROOTS = ["/ledger", "/workspace"];

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
    const content = await readFile(validation.resolved, "utf-8");
    const fileStat = await stat(validation.resolved);
    res.json({
      path: validation.resolved,
      content,
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    });
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
