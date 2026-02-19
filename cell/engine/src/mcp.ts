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

export function createNexusMcpServer() {
  return createSdkMcpServer({
    name: "nexus-intercom",
    version: "1.0.0",
    tools: [sendMessageTool, listAgentsTool, sharedWriteTool, sharedReadTool],
  });
}
