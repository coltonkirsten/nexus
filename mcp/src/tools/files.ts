import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall, fetchApi, jsonResponse, errorResponse } from "../api.js";

export function registerFileTools(server: McpServer): void {
  server.tool(
    "read_workspace",
    "Read an agent's workspace. Omit path to list the file tree, or provide a path to read a specific file.",
    {
      agentId: z.string().describe("The agent ID"),
      path: z.string().optional().describe("File path to read. Omit to list the workspace file tree."),
    },
    async ({ agentId, path }) => {
      if (path) {
        return apiCall(`/api/agents/${agentId}/workspace/file`, { query: { path } });
      }
      return apiCall(`/api/agents/${agentId}/workspace`);
    }
  );

  server.tool(
    "read_ledger",
    "Read an agent's ledger. Omit path to list the file tree, or provide a path to read a specific file.",
    {
      agentId: z.string().describe("The agent ID"),
      path: z.string().optional().describe("File path to read. Omit to list the ledger file tree."),
    },
    async ({ agentId, path }) => {
      if (path) {
        return apiCall(`/api/agents/${agentId}/ledger/file`, { query: { path } });
      }
      return apiCall(`/api/agents/${agentId}/ledger`);
    }
  );

  server.tool(
    "write_ledger",
    "Write content to a file in an agent's ledger volume.",
    {
      agentId: z.string().describe("The agent ID"),
      path: z.string().describe("File path within the ledger to write to"),
      content: z.string().describe("The content to write"),
    },
    async ({ agentId, path, content }) =>
      apiCall(`/api/agents/${agentId}/ledger/file`, {
        method: "PUT",
        body: { content },
        query: { path },
      })
  );

  server.tool(
    "get_system_prompt",
    "Get the assembled system prompt for a running agent, including identity, memory, and skills.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/system-prompt`)
  );
}
