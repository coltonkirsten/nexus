import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api.js";

export function registerMessagingTools(server: McpServer): void {
  server.tool(
    "send_message",
    "Send a message to a Nexus agent. The agent must be running. Messages are queued and processed in order.",
    {
      agentId: z.string().describe("The target agent ID"),
      message: z.string().describe("The message content to send"),
      role: z.enum(["user", "agent", "system"]).optional().describe("Message role (default: 'user')"),
      metadata: z.record(z.unknown()).optional().describe("Optional metadata to attach to the message"),
    },
    async ({ agentId, ...body }) =>
      apiCall(`/api/agents/${agentId}/messages`, { method: "POST", body })
  );

  server.tool(
    "get_messages",
    "Get the message queue/history for an agent.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/messages`)
  );

  server.tool(
    "get_queue_stats",
    "Get message queue statistics (pending, processing, completed, failed counts) for an agent.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/queue/stats`)
  );
}
