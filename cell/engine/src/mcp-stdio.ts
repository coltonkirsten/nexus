/**
 * Standalone stdio-based MCP server for the CLI cell mode.
 * Spawned as a child process by the `claude` CLI via --mcp-config.
 * Implements the same 5 tools as mcp.ts but using @modelcontextprotocol/sdk
 * with StdioServerTransport instead of the SDK's createSdkMcpServer.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, normalize } from "path";
import { withLock } from "./mutex.js";

const NEXUS_API_URL = process.env.NEXUS_API_URL || "http://host.docker.internal:3001";
const AGENT_ID = process.env.AGENT_ID || "unknown";
const AGENT_NAME = process.env.AGENT_NAME || "Agent";

interface PeerAgent {
  id: string;
  name: string;
  status: string;
}

const PEERS_FILE = "/tmp/nexus-peers.json";

// Load peers dynamically from shared file (written by engine), falling back to env
function loadPeers(): PeerAgent[] {
  try {
    const data = readFileSync(PEERS_FILE, "utf-8");
    return JSON.parse(data) as PeerAgent[];
  } catch {
    // Fall back to env (initial snapshot from engine)
    try {
      const peersEnv = process.env.NEXUS_PEERS;
      if (peersEnv) {
        return JSON.parse(peersEnv) as PeerAgent[];
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  }
}

function validateSharedPath(path: string): string {
  const resolved = normalize(join("/shared", path));
  if (!resolved.startsWith("/shared/") && resolved !== "/shared") {
    throw new Error("Path must stay within /shared/");
  }
  return resolved;
}

const server = new McpServer({
  name: "nexus-intercom",
  version: "1.0.0",
});

// --- send_message ---
server.tool(
  "send_message",
  "Send a message to another NEXUS agent by name or ID. The message will be queued and processed by the target agent.",
  {
    to: z.string().describe("The name or ID of the target agent"),
    message: z.string().describe("The message content to send"),
  },
  async (args) => {
    const peers = loadPeers();
    const target = peers.find(
      (p) => p.id === args.to || p.name.toLowerCase() === args.to.toLowerCase()
    );

    if (!target) {
      const available = peers.map((p) => p.name).join(", ");
      return {
        content: [
          { type: "text" as const, text: `Error: Agent "${args.to}" not found. Available agents: ${available || "none"}` },
        ],
      };
    }

    if (target.id === AGENT_ID) {
      return {
        content: [
          { type: "text" as const, text: "Error: Cannot send a message to yourself." },
        ],
      };
    }

    try {
      const response = await fetch(
        `${NEXUS_API_URL}/api/agents/${target.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: args.message,
            role: "agent",
            metadata: {
              fromAgentId: AGENT_ID,
              fromAgentName: AGENT_NAME,
            },
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        return {
          content: [
            { type: "text" as const, text: `Error sending message to "${target.name}": ${response.status} ${body}` },
          ],
        };
      }

      return {
        content: [
          { type: "text" as const, text: `Message sent to "${target.name}" successfully.` },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: "text" as const, text: `Error sending message: ${err instanceof Error ? err.message : String(err)}` },
        ],
      };
    }
  }
);

// --- list_agents ---
server.tool(
  "list_agents",
  "List all other NEXUS agents you can communicate with, showing their name and current status.",
  {},
  async () => {
    const peers = loadPeers();
    const otherPeers = peers.filter((p) => p.id !== AGENT_ID);
    if (otherPeers.length === 0) {
      return {
        content: [
          { type: "text" as const, text: "No other agents are currently registered." },
        ],
      };
    }

    const lines = otherPeers.map((p) => `- ${p.name} (${p.status})`);
    return {
      content: [
        { type: "text" as const, text: `NEXUS Agents:\n${lines.join("\n")}` },
      ],
    };
  }
);

// --- shared_write ---
server.tool(
  "shared_write",
  "Write content to a file on the shared inter-agent drive at /shared/. Uses file-based locking to prevent write races between agents.",
  {
    path: z.string().describe("Relative path within /shared/ (e.g. 'data/results.txt')"),
    content: z.string().describe("The content to write to the file"),
  },
  async (args) => {
    try {
      const fullPath = validateSharedPath(args.path);

      await withLock(args.path, async () => {
        const parentDir = join(fullPath, "..");
        await mkdir(parentDir, { recursive: true });
        await writeFile(fullPath, args.content, "utf-8");
      });

      return {
        content: [
          { type: "text" as const, text: `Wrote to /shared/${args.path} successfully.` },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: "text" as const, text: `Error writing to shared drive: ${err instanceof Error ? err.message : String(err)}` },
        ],
      };
    }
  }
);

// --- shared_read ---
server.tool(
  "shared_read",
  "Read content from a file on the shared inter-agent drive at /shared/.",
  {
    path: z.string().describe("Relative path within /shared/ (e.g. 'data/results.txt')"),
  },
  async (args) => {
    try {
      const fullPath = validateSharedPath(args.path);
      const content = await readFile(fullPath, "utf-8");
      return {
        content: [{ type: "text" as const, text: content }],
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return {
          content: [
            { type: "text" as const, text: `File not found: /shared/${args.path}` },
          ],
        };
      }
      return {
        content: [
          { type: "text" as const, text: `Error reading from shared drive: ${err instanceof Error ? err.message : String(err)}` },
        ],
      };
    }
  }
);

// --- manage_cron ---
server.tool(
  "manage_cron",
  "Manage scheduled/cron jobs for this agent. Create recurring tasks, one-time scheduled tasks, or interval-based tasks that automatically send messages to yourself on a schedule.",
  {
    action: z.enum(["create", "list", "update", "delete", "trigger"]).describe("The action to perform"),
    jobId: z.string().optional().describe("Job ID (required for update, delete, trigger)"),
    name: z.string().optional().describe("Job name (required for create)"),
    scheduleType: z.enum(["cron", "at", "every"]).optional().describe("Schedule type (required for create)"),
    scheduleValue: z.string().optional().describe("Schedule value. For 'cron': expression like '0 9 * * *'. For 'at': ISO 8601 datetime. For 'every': interval in ms (min 60000)."),
    timezone: z.string().optional().describe("IANA timezone for cron schedules"),
    message: z.string().optional().describe("Message content that will be sent to you when the job fires"),
    enabled: z.boolean().optional().describe("Enable/disable job (for update action)"),
  },
  async (args) => {
    try {
      switch (args.action) {
        case "create": {
          if (!args.name || !args.scheduleType || !args.scheduleValue || !args.message) {
            return {
              content: [{ type: "text" as const, text: "Error: 'name', 'scheduleType', 'scheduleValue', and 'message' are required for create action." }],
            };
          }

          let schedule: Record<string, unknown>;
          switch (args.scheduleType) {
            case "cron": schedule = { kind: "cron", expression: args.scheduleValue, timezone: args.timezone }; break;
            case "at": schedule = { kind: "at", datetime: args.scheduleValue }; break;
            case "every": schedule = { kind: "every", intervalMs: parseInt(args.scheduleValue) }; break;
          }

          const createRes = await fetch(`${NEXUS_API_URL}/api/agents/${AGENT_ID}/cron`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: args.name, schedule, message: args.message, createdBy: "agent" }),
          });

          if (!createRes.ok) {
            const body = await createRes.text();
            return { content: [{ type: "text" as const, text: `Error creating cron job: ${createRes.status} ${body}` }] };
          }

          const created = (await createRes.json()) as { job?: { id?: string } };
          return { content: [{ type: "text" as const, text: `Cron job "${args.name}" created successfully (ID: ${created.job?.id || "unknown"}).` }] };
        }

        case "list": {
          const listRes = await fetch(`${NEXUS_API_URL}/api/agents/${AGENT_ID}/cron`);
          if (!listRes.ok) {
            const body = await listRes.text();
            return { content: [{ type: "text" as const, text: `Error listing cron jobs: ${listRes.status} ${body}` }] };
          }

          const data = (await listRes.json()) as { jobs?: Array<Record<string, unknown>> };
          const jobs = data.jobs || [];
          if (jobs.length === 0) {
            return { content: [{ type: "text" as const, text: "No scheduled jobs." }] };
          }

          const lines = jobs.map((job) => [
            `- ${job.name || "Unnamed"} (ID: ${job.id})`,
            `  Schedule: ${JSON.stringify(job.schedule)}`,
            `  Enabled: ${job.enabled !== false ? "yes" : "no"}`,
            `  Next run: ${job.nextRunAt || "N/A"}`,
            `  Run count: ${job.runCount ?? 0}`,
          ].join("\n"));

          return { content: [{ type: "text" as const, text: `Scheduled jobs:\n${lines.join("\n\n")}` }] };
        }

        case "update": {
          if (!args.jobId) {
            return { content: [{ type: "text" as const, text: "Error: 'jobId' is required for update action." }] };
          }
          const updateBody: Record<string, unknown> = {};
          if (args.name !== undefined) updateBody.name = args.name;
          if (args.message !== undefined) updateBody.message = args.message;
          if (args.enabled !== undefined) updateBody.enabled = args.enabled;
          if (args.scheduleType && args.scheduleValue) {
            switch (args.scheduleType) {
              case "cron": updateBody.schedule = { kind: "cron", expression: args.scheduleValue, timezone: args.timezone }; break;
              case "at": updateBody.schedule = { kind: "at", datetime: args.scheduleValue }; break;
              case "every": updateBody.schedule = { kind: "every", intervalMs: parseInt(args.scheduleValue) }; break;
            }
          }

          const updateRes = await fetch(`${NEXUS_API_URL}/api/agents/${AGENT_ID}/cron/${args.jobId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updateBody),
          });

          if (!updateRes.ok) {
            const body = await updateRes.text();
            return { content: [{ type: "text" as const, text: `Error updating cron job: ${updateRes.status} ${body}` }] };
          }
          return { content: [{ type: "text" as const, text: `Cron job "${args.jobId}" updated successfully.` }] };
        }

        case "delete": {
          if (!args.jobId) {
            return { content: [{ type: "text" as const, text: "Error: 'jobId' is required for delete action." }] };
          }
          const deleteRes = await fetch(`${NEXUS_API_URL}/api/agents/${AGENT_ID}/cron/${args.jobId}`, { method: "DELETE" });
          if (!deleteRes.ok) {
            const body = await deleteRes.text();
            return { content: [{ type: "text" as const, text: `Error deleting cron job: ${deleteRes.status} ${body}` }] };
          }
          return { content: [{ type: "text" as const, text: `Cron job "${args.jobId}" deleted successfully.` }] };
        }

        case "trigger": {
          if (!args.jobId) {
            return { content: [{ type: "text" as const, text: "Error: 'jobId' is required for trigger action." }] };
          }
          const triggerRes = await fetch(`${NEXUS_API_URL}/api/agents/${AGENT_ID}/cron/${args.jobId}/trigger`, { method: "POST" });
          if (!triggerRes.ok) {
            const body = await triggerRes.text();
            return { content: [{ type: "text" as const, text: `Error triggering cron job: ${triggerRes.status} ${body}` }] };
          }
          return { content: [{ type: "text" as const, text: `Cron job "${args.jobId}" triggered successfully.` }] };
        }
      }
    } catch (err) {
      return {
        content: [
          { type: "text" as const, text: `Error managing cron job: ${err instanceof Error ? err.message : String(err)}` },
        ],
      };
    }
  }
);

// --- send_human_mail ---
const TEAM_ID = process.env.TEAM_ID || "";

server.tool(
  "send_human_mail",
  "Send a message to the human operators via the team mailbox. Use this to ask questions, request approvals, provide status updates, or deliver results to humans.",
  {
    subject: z.string().describe("A short subject line for the message"),
    body: z.string().describe("The full message body"),
    category: z
      .enum(["question", "approval", "status", "deliverable", "general"])
      .optional()
      .describe("Message category: question, approval, status, deliverable, or general"),
    replyToId: z.string().optional().describe("ID of a previous mail message to reply to"),
  },
  async (args) => {
    if (!TEAM_ID) {
      return {
        content: [
          { type: "text" as const, text: "Error: This agent is not part of a team. The send_human_mail tool requires TEAM_ID to be set." },
        ],
      };
    }

    try {
      const response = await fetch(
        `${NEXUS_API_URL}/api/teams/${TEAM_ID}/mailbox/from-agent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: AGENT_ID,
            agentName: AGENT_NAME,
            subject: args.subject,
            body: args.body,
            category: args.category,
            replyToId: args.replyToId,
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        return {
          content: [
            { type: "text" as const, text: `Error sending mail to humans: ${response.status} ${body}` },
          ],
        };
      }

      return {
        content: [
          { type: "text" as const, text: `Mail sent to human operators successfully. Subject: "${args.subject}"` },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: "text" as const, text: `Error sending mail: ${err instanceof Error ? err.message : String(err)}` },
        ],
      };
    }
  }
);

// --- Kanban tools ---
// Helper: call the NEXUS API and return an MCP content response.
async function kanbanApiCall(path: string, init?: { method?: string; body?: unknown }) {
  try {
    const headers: Record<string, string> = {};
    if (init?.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${NEXUS_API_URL}${path}`, {
      method: init?.method || "GET",
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      return { content: [{ type: "text" as const, text: `Error: ${response.status} ${text}` }] };
    }
    // Pretty-print JSON if possible; otherwise return raw text.
    try {
      const parsed = JSON.parse(text);
      return { content: [{ type: "text" as const, text: JSON.stringify(parsed, null, 2) }] };
    } catch {
      return { content: [{ type: "text" as const, text }] };
    }
  } catch (err) {
    return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
  }
}

function kanbanError(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
}

server.tool(
  "board_manage",
  "Manage kanban boards for a team. Actions: list, get, create, delete. Defaults to your own team if teamId is omitted.",
  {
    action: z.enum(["list", "get", "create", "delete"]).describe("The action to perform"),
    teamId: z.string().optional().describe("The team ID (defaults to your own team)"),
    boardId: z.string().optional().describe("Board ID (required for get, delete)"),
    name: z.string().optional().describe("Board name (required for create)"),
    description: z.string().optional().describe("Board description (optional for create)"),
  },
  async (args) => {
    const teamId = args.teamId || TEAM_ID;
    if (!teamId) return kanbanError("No teamId provided and this agent has no TEAM_ID.");

    switch (args.action) {
      case "list":
        return kanbanApiCall(`/api/teams/${teamId}/boards`);
      case "get": {
        if (!args.boardId) return kanbanError("'boardId' is required for get action.");
        return kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}`);
      }
      case "create": {
        if (!args.name) return kanbanError("'name' is required for create action.");
        return kanbanApiCall(`/api/teams/${teamId}/boards`, {
          method: "POST",
          body: { name: args.name, description: args.description },
        });
      }
      case "delete": {
        if (!args.boardId) return kanbanError("'boardId' is required for delete action.");
        return kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}`, { method: "DELETE" });
      }
    }
  }
);

server.tool(
  "card_manage",
  "Manage kanban cards. Actions: create, get, update, delete, move. Defaults to your own team if teamId is omitted. To assign a card to a human, set assigneeName to the human's name (e.g. 'Colton') and leave assigneeId empty.",
  {
    action: z.enum(["create", "get", "update", "delete", "move"]).describe("The action to perform"),
    teamId: z.string().optional().describe("The team ID (defaults to your own team)"),
    boardId: z.string().describe("The board ID"),
    cardId: z.string().optional().describe("Card ID (required for get, update, delete, move)"),
    columnId: z.string().optional().describe("Column ID (required for create, move target)"),
    title: z.string().optional().describe("Card title (required for create)"),
    description: z.string().optional().describe("Card description"),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Card priority"),
    assigneeId: z.string().optional().describe("Agent ID to assign the card to (omit when assigning to a human)"),
    assigneeName: z.string().optional().describe("Name of the assignee. For humans, set this to the human's name (e.g. 'Colton') and leave assigneeId empty. For agents, pass their name here alongside assigneeId."),
    dueDate: z.string().optional().describe("Due date in ISO format"),
    labels: z.array(z.string()).optional().describe("Array of label strings"),
    position: z.number().optional().describe("Position in target column (for move)"),
  },
  async (args) => {
    const teamId = args.teamId || TEAM_ID;
    if (!teamId) return kanbanError("No teamId provided and this agent has no TEAM_ID.");

    switch (args.action) {
      case "create": {
        if (!args.columnId) return kanbanError("'columnId' is required for create action.");
        if (!args.title) return kanbanError("'title' is required for create action.");
        const body: Record<string, unknown> = { columnId: args.columnId, title: args.title };
        if (args.description !== undefined) body.description = args.description;
        if (args.priority !== undefined) body.priority = args.priority;
        if (args.assigneeId !== undefined) body.assigneeId = args.assigneeId;
        if (args.assigneeName !== undefined) body.assigneeName = args.assigneeName;
        if (args.dueDate !== undefined) body.dueDate = args.dueDate;
        if (args.labels !== undefined) body.labels = args.labels;
        return kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}/cards`, { method: "POST", body });
      }
      case "get": {
        if (!args.cardId) return kanbanError("'cardId' is required for get action.");
        const result = await kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}`);
        const text = result.content[0]?.text || "";
        if (!text.startsWith("Error:")) {
          try {
            const board = JSON.parse(text).board;
            for (const col of board.columns) {
              const card = col.cards.find((c: { id: string }) => c.id === args.cardId);
              if (card) {
                return {
                  content: [{ type: "text" as const, text: JSON.stringify({ card, columnId: col.id, columnName: col.name }, null, 2) }],
                };
              }
            }
            return kanbanError(`Card '${args.cardId}' not found in board.`);
          } catch {
            return result;
          }
        }
        return result;
      }
      case "update": {
        if (!args.cardId) return kanbanError("'cardId' is required for update action.");
        const body: Record<string, unknown> = {};
        if (args.title !== undefined) body.title = args.title;
        if (args.description !== undefined) body.description = args.description;
        if (args.priority !== undefined) body.priority = args.priority;
        if (args.assigneeId !== undefined) body.assigneeId = args.assigneeId;
        if (args.assigneeName !== undefined) body.assigneeName = args.assigneeName;
        if (args.dueDate !== undefined) body.dueDate = args.dueDate;
        if (args.labels !== undefined) body.labels = args.labels;
        return kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}/cards/${args.cardId}`, { method: "PATCH", body });
      }
      case "delete": {
        if (!args.cardId) return kanbanError("'cardId' is required for delete action.");
        return kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}/cards/${args.cardId}`, { method: "DELETE" });
      }
      case "move": {
        if (!args.cardId) return kanbanError("'cardId' is required for move action.");
        if (!args.columnId) return kanbanError("'columnId' (target column) is required for move action.");
        const body: Record<string, unknown> = { targetColumnId: args.columnId };
        if (args.position !== undefined) body.position = args.position;
        return kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}/cards/${args.cardId}/move`, { method: "POST", body });
      }
    }
  }
);

server.tool(
  "column_manage",
  "Manage kanban columns in a board. Actions: create, update, delete, reorder. Defaults to your own team if teamId is omitted.",
  {
    action: z.enum(["create", "update", "delete", "reorder"]).describe("The action to perform"),
    teamId: z.string().optional().describe("The team ID (defaults to your own team)"),
    boardId: z.string().describe("The board ID"),
    columnId: z.string().optional().describe("Column ID (required for update, delete)"),
    name: z.string().optional().describe("Column name (required for create)"),
    position: z.number().optional().describe("Column position"),
    columnOrder: z.array(z.string()).optional().describe("Array of column IDs in new order (for reorder)"),
  },
  async (args) => {
    const teamId = args.teamId || TEAM_ID;
    if (!teamId) return kanbanError("No teamId provided and this agent has no TEAM_ID.");

    switch (args.action) {
      case "create": {
        if (!args.name) return kanbanError("'name' is required for create action.");
        return kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}/columns`, {
          method: "POST",
          body: { name: args.name, position: args.position },
        });
      }
      case "update": {
        if (!args.columnId) return kanbanError("'columnId' is required for update action.");
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body.name = args.name;
        if (args.position !== undefined) body.position = args.position;
        return kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}/columns/${args.columnId}`, { method: "PATCH", body });
      }
      case "delete": {
        if (!args.columnId) return kanbanError("'columnId' is required for delete action.");
        return kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}/columns/${args.columnId}`, { method: "DELETE" });
      }
      case "reorder": {
        if (!args.columnOrder) return kanbanError("'columnOrder' is required for reorder action.");
        return kanbanApiCall(`/api/teams/${teamId}/boards/${args.boardId}/columns/reorder`, {
          method: "POST",
          body: { columnIds: args.columnOrder },
        });
      }
    }
  }
);

// Start the stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP stdio server error:", err);
  process.exit(1);
});
