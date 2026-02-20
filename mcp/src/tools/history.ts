import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api.js";

export function registerHistoryTools(server: McpServer): void {
  server.tool(
    "get_invocation_history",
    "Get the invocation history for an agent, showing past task executions with input, result, duration, token usage, and cost.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/history`)
  );

  server.tool(
    "get_raw_logs",
    "Get raw log entries from an agent's engine. Returns the full log history including agent_start, agent_message, agent_complete events.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/logs/raw`)
  );

  server.tool(
    "clear_session",
    "Clear an agent's current conversation session, resetting its context.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/session/clear`, { method: "POST" })
  );
}
