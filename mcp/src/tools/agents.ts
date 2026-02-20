import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall, fetchApi, jsonResponse, errorResponse, success } from "../api.js";

export function registerAgentTools(server: McpServer): void {
  server.tool(
    "list_agents",
    "List all Nexus agents with their current status.",
    {},
    async () => apiCall("/api/agents")
  );

  server.tool(
    "get_agent",
    "Get detailed information about a specific Nexus agent.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}`)
  );

  server.tool(
    "create_agent",
    "Create a new Nexus agent. Returns the created agent with its ID.",
    {
      name: z.string().describe("Name for the new agent"),
      template: z.string().optional().describe("Template to initialize the agent's ledger (e.g. 'blank', 'coder')"),
      cellType: z.string().optional().describe("Cell type to use (e.g. 'claude-code', 'claude-api'). Defaults to 'claude-code'"),
    },
    async (args) => apiCall("/api/agents", { method: "POST", body: args })
  );

  server.tool(
    "update_agent",
    "Update an agent's name or runtime configuration.",
    {
      agentId: z.string().describe("The agent ID"),
      name: z.string().optional().describe("New name for the agent"),
      config: z.object({
        model: z.string().optional(),
        maxTurns: z.number().optional(),
        timeout: z.number().optional(),
        allowedTools: z.array(z.string()).optional(),
      }).optional().describe("Runtime configuration overrides"),
    },
    async ({ agentId, ...body }) => apiCall(`/api/agents/${agentId}`, { method: "PATCH", body })
  );

  server.tool(
    "delete_agent",
    "Delete an agent. Optionally delete its volumes too.",
    {
      agentId: z.string().describe("The agent ID"),
      deleteVolumes: z.boolean().optional().describe("Also delete the agent's ledger and workspace volumes (default: false)"),
    },
    async ({ agentId, deleteVolumes }) =>
      apiCall(`/api/agents/${agentId}`, {
        method: "DELETE",
        query: deleteVolumes ? { deleteVolumes: "true" } : undefined,
      })
  );

  server.tool(
    "start_agent",
    "Start an agent's container. The agent will become available to receive messages.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/start`, { method: "POST" })
  );

  server.tool(
    "stop_agent",
    "Stop an agent's container gracefully.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/stop`, { method: "POST" })
  );

  server.tool(
    "get_agent_status",
    "Get the current status, health, and port of an agent.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/status`)
  );

  server.tool(
    "cancel_agent_task",
    "Cancel the currently running task on an agent.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/cancel`, { method: "POST" })
  );
}
