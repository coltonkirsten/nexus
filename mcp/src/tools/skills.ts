import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall, errorResponse } from "../api.js";

export function registerSkillTools(server: McpServer): void {
  server.tool(
    "manage_skills",
    "Manage an agent's skills. Actions: list, get, create, update, delete.",
    {
      action: z.enum(["list", "get", "create", "update", "delete"]).describe("The action to perform"),
      agentId: z.string().describe("The agent ID"),
      name: z.string().optional().describe("Skill name (required for get, create, update, delete)"),
      content: z.string().optional().describe("Skill content/instructions (required for create, update)"),
      description: z.string().optional().describe("Skill description (optional for create)"),
    },
    async (args) => {
      const { action, agentId, name, content, description } = args;

      switch (action) {
        case "list":
          return apiCall(`/api/agents/${agentId}/skills`);

        case "get": {
          if (!name) return errorResponse("'name' is required for get action.");
          return apiCall(`/api/agents/${agentId}/skills/${encodeURIComponent(name)}`);
        }

        case "create": {
          if (!name) return errorResponse("'name' is required for create action.");
          return apiCall(`/api/agents/${agentId}/skills`, {
            method: "POST",
            body: { name, content: content || "", description },
          });
        }

        case "update": {
          if (!name) return errorResponse("'name' is required for update action.");
          if (content === undefined) return errorResponse("'content' is required for update action.");
          return apiCall(`/api/agents/${agentId}/skills/${encodeURIComponent(name)}`, {
            method: "PUT",
            body: { content },
          });
        }

        case "delete": {
          if (!name) return errorResponse("'name' is required for delete action.");
          return apiCall(`/api/agents/${agentId}/skills/${encodeURIComponent(name)}`, {
            method: "DELETE",
          });
        }
      }
    }
  );
}
