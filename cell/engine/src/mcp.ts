import { createSdkMcpServer, tool } from "@anthropic-ai/claude-code";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, normalize } from "path";
import { withLock } from "./mutex.js";

const NEXUS_API_URL = process.env.NEXUS_API_URL || "http://host.docker.internal:3001";
const AGENT_ID = process.env.AGENT_ID || "unknown";

export interface PeerAgent {
  id: string;
  name: string;
  status: string;
}

// In-memory peer cache
let peers: PeerAgent[] = [];

export function updatePeers(newPeers: PeerAgent[]): void {
  peers = newPeers;
}

export function getPeers(): PeerAgent[] {
  return peers;
}

function validateSharedPath(path: string): string {
  const resolved = normalize(join("/shared", path));
  if (!resolved.startsWith("/shared/") && resolved !== "/shared") {
    throw new Error("Path must stay within /shared/");
  }
  return resolved;
}

const sendMessageTool = tool(
  "send_message",
  "Send a message to another NEXUS agent by name or ID. The message will be queued and processed by the target agent.",
  {
    to: z.string().describe("The name or ID of the target agent"),
    message: z.string().describe("The message content to send"),
  },
  async (args) => {
    // Resolve agent name/ID from peer list
    const target = peers.find(
      (p) => p.id === args.to || p.name.toLowerCase() === args.to.toLowerCase()
    );

    if (!target) {
      const available = peers.map((p) => p.name).join(", ");
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Agent "${args.to}" not found. Available agents: ${available || "none"}`,
          },
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
              fromAgentName: peers.find((p) => p.id === AGENT_ID)?.name || AGENT_ID,
            },
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        return {
          content: [
            {
              type: "text" as const,
              text: `Error sending message to "${target.name}": ${response.status} ${body}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Message sent to "${target.name}" successfully.`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error sending message: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  }
);

const listAgentsTool = tool(
  "list_agents",
  "List all other NEXUS agents you can communicate with, showing their name and current status.",
  {},
  async () => {
    const otherPeers = peers.filter((p) => p.id !== AGENT_ID);
    if (otherPeers.length === 0) {
      return {
        content: [
          { type: "text" as const, text: "No other agents are currently registered." },
        ],
      };
    }

    const lines = otherPeers.map(
      (p) => `- ${p.name} (${p.status})${p.id === AGENT_ID ? " [you]" : ""}`
    );
    return {
      content: [
        {
          type: "text" as const,
          text: `NEXUS Agents:\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

const sharedWriteTool = tool(
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
        // Ensure parent directory exists
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
          {
            type: "text" as const,
            text: `Error writing to shared drive: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  }
);

const sharedReadTool = tool(
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
          {
            type: "text" as const,
            text: `Error reading from shared drive: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  }
);

const manageCronTool = tool(
  "manage_cron",
  "Manage scheduled/cron jobs for this agent. Create recurring tasks, one-time scheduled tasks, or interval-based tasks that automatically send messages to yourself on a schedule.",
  {
    action: z.enum(["create", "list", "update", "delete", "trigger"]).describe("The action to perform"),
    jobId: z.string().optional().describe("Job ID (required for update, delete, trigger)"),
    name: z.string().optional().describe("Job name (required for create)"),
    scheduleType: z.enum(["cron", "at", "every"]).optional().describe("Schedule type (required for create). 'cron' = cron expression, 'at' = one-time at specific datetime, 'every' = recurring interval"),
    scheduleValue: z.string().optional().describe("Schedule value. For 'cron': expression like '0 9 * * *'. For 'at': ISO 8601 datetime. For 'every': interval in ms (min 60000)."),
    timezone: z.string().optional().describe("IANA timezone for cron schedules (e.g. 'America/New_York'). Default: UTC"),
    message: z.string().optional().describe("Message content that will be sent to you when the job fires"),
    enabled: z.boolean().optional().describe("Enable/disable job (for update action)"),
  },
  async (args) => {
    try {
      switch (args.action) {
        case "create": {
          if (!args.name || !args.scheduleType || !args.scheduleValue || !args.message) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'name', 'scheduleType', 'scheduleValue', and 'message' are required for create action.",
                },
              ],
            };
          }

          let schedule: Record<string, unknown>;
          switch (args.scheduleType) {
            case "cron":
              schedule = { kind: "cron", expression: args.scheduleValue, timezone: args.timezone };
              break;
            case "at":
              schedule = { kind: "at", datetime: args.scheduleValue };
              break;
            case "every":
              schedule = { kind: "every", intervalMs: parseInt(args.scheduleValue) };
              break;
          }

          const createRes = await fetch(
            `${NEXUS_API_URL}/api/agents/${AGENT_ID}/cron`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: args.name,
                schedule,
                message: args.message,
                createdBy: "agent",
              }),
            }
          );

          if (!createRes.ok) {
            const body = await createRes.text();
            return {
              content: [
                { type: "text" as const, text: `Error creating cron job: ${createRes.status} ${body}` },
              ],
            };
          }

          const created = (await createRes.json()) as { job?: { id?: string } };
          return {
            content: [
              {
                type: "text" as const,
                text: `Cron job "${args.name}" created successfully (ID: ${created.job?.id || "unknown"}).`,
              },
            ],
          };
        }

        case "list": {
          const listRes = await fetch(
            `${NEXUS_API_URL}/api/agents/${AGENT_ID}/cron`
          );

          if (!listRes.ok) {
            const body = await listRes.text();
            return {
              content: [
                { type: "text" as const, text: `Error listing cron jobs: ${listRes.status} ${body}` },
              ],
            };
          }

          const jobs = await listRes.json();
          if (!Array.isArray(jobs) || jobs.length === 0) {
            return {
              content: [{ type: "text" as const, text: "No scheduled jobs." }],
            };
          }

          const lines = jobs.map((job: Record<string, unknown>) => {
            const scheduleInfo = job.schedule
              ? JSON.stringify(job.schedule)
              : "unknown";
            return [
              `- ${job.name || "Unnamed"} (ID: ${job.id || job._id})`,
              `  Schedule: ${scheduleInfo}`,
              `  Enabled: ${job.enabled !== false ? "yes" : "no"}`,
              `  Next run: ${job.nextRunAt || "N/A"}`,
              `  Last run: ${job.lastRunAt || "N/A"}`,
              `  Run count: ${job.runCount ?? 0}`,
            ].join("\n");
          });

          return {
            content: [
              { type: "text" as const, text: `Scheduled jobs:\n${lines.join("\n\n")}` },
            ],
          };
        }

        case "update": {
          if (!args.jobId) {
            return {
              content: [
                { type: "text" as const, text: "Error: 'jobId' is required for update action." },
              ],
            };
          }

          const updateBody: Record<string, unknown> = {};
          if (args.name !== undefined) updateBody.name = args.name;
          if (args.message !== undefined) updateBody.message = args.message;
          if (args.enabled !== undefined) updateBody.enabled = args.enabled;

          if (args.scheduleType && args.scheduleValue) {
            switch (args.scheduleType) {
              case "cron":
                updateBody.schedule = { kind: "cron", expression: args.scheduleValue, timezone: args.timezone };
                break;
              case "at":
                updateBody.schedule = { kind: "at", datetime: args.scheduleValue };
                break;
              case "every":
                updateBody.schedule = { kind: "every", intervalMs: parseInt(args.scheduleValue) };
                break;
            }
          }

          const updateRes = await fetch(
            `${NEXUS_API_URL}/api/agents/${AGENT_ID}/cron/${args.jobId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updateBody),
            }
          );

          if (!updateRes.ok) {
            const body = await updateRes.text();
            return {
              content: [
                { type: "text" as const, text: `Error updating cron job: ${updateRes.status} ${body}` },
              ],
            };
          }

          return {
            content: [
              { type: "text" as const, text: `Cron job "${args.jobId}" updated successfully.` },
            ],
          };
        }

        case "delete": {
          if (!args.jobId) {
            return {
              content: [
                { type: "text" as const, text: "Error: 'jobId' is required for delete action." },
              ],
            };
          }

          const deleteRes = await fetch(
            `${NEXUS_API_URL}/api/agents/${AGENT_ID}/cron/${args.jobId}`,
            { method: "DELETE" }
          );

          if (!deleteRes.ok) {
            const body = await deleteRes.text();
            return {
              content: [
                { type: "text" as const, text: `Error deleting cron job: ${deleteRes.status} ${body}` },
              ],
            };
          }

          return {
            content: [
              { type: "text" as const, text: `Cron job "${args.jobId}" deleted successfully.` },
            ],
          };
        }

        case "trigger": {
          if (!args.jobId) {
            return {
              content: [
                { type: "text" as const, text: "Error: 'jobId' is required for trigger action." },
              ],
            };
          }

          const triggerRes = await fetch(
            `${NEXUS_API_URL}/api/agents/${AGENT_ID}/cron/${args.jobId}/trigger`,
            { method: "POST" }
          );

          if (!triggerRes.ok) {
            const body = await triggerRes.text();
            return {
              content: [
                { type: "text" as const, text: `Error triggering cron job: ${triggerRes.status} ${body}` },
              ],
            };
          }

          return {
            content: [
              { type: "text" as const, text: `Cron job "${args.jobId}" triggered successfully.` },
            ],
          };
        }
      }
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error managing cron job: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  }
);

export function createNexusMcpServer() {
  return createSdkMcpServer({
    name: "nexus-intercom",
    version: "1.0.0",
    tools: [sendMessageTool, listAgentsTool, sharedWriteTool, sharedReadTool, manageCronTool],
  });
}
