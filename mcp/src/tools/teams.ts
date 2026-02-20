import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall, errorResponse } from "../api.js";

export function registerTeamTools(server: McpServer): void {
  server.tool(
    "manage_teams",
    "Manage Nexus teams. Actions: list, get, create, update, delete.",
    {
      action: z.enum(["list", "get", "create", "update", "delete"]).describe("The action to perform"),
      teamId: z.string().optional().describe("Team ID (required for get, update, delete)"),
      name: z.string().optional().describe("Team name (required for create)"),
      description: z.string().optional().describe("Team description"),
    },
    async (args) => {
      const { action, teamId, name, description } = args;

      switch (action) {
        case "list":
          return apiCall("/api/teams");

        case "get": {
          if (!teamId) return errorResponse("'teamId' is required for get action.");
          return apiCall(`/api/teams/${teamId}`);
        }

        case "create": {
          if (!name) return errorResponse("'name' is required for create action.");
          return apiCall("/api/teams", { method: "POST", body: { name, description } });
        }

        case "update": {
          if (!teamId) return errorResponse("'teamId' is required for update action.");
          const body: Record<string, unknown> = {};
          if (name !== undefined) body.name = name;
          if (description !== undefined) body.description = description;
          return apiCall(`/api/teams/${teamId}`, { method: "PATCH", body });
        }

        case "delete": {
          if (!teamId) return errorResponse("'teamId' is required for delete action.");
          return apiCall(`/api/teams/${teamId}`, { method: "DELETE" });
        }
      }
    }
  );

  server.tool(
    "manage_team_members",
    "Add or remove agents from a team.",
    {
      action: z.enum(["add", "remove"]).describe("The action to perform"),
      teamId: z.string().describe("The team ID"),
      agentId: z.string().describe("The agent ID to add or remove"),
    },
    async ({ action, teamId, agentId }) => {
      switch (action) {
        case "add":
          return apiCall(`/api/teams/${teamId}/members`, {
            method: "POST",
            body: { agentId },
          });

        case "remove":
          return apiCall(`/api/teams/${teamId}/members/${agentId}`, {
            method: "DELETE",
          });
      }
    }
  );
}
