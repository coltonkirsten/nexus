import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall, errorResponse } from "../api.js";

export function registerVolumeTools(server: McpServer): void {
  server.tool(
    "manage_volumes",
    "Manage Nexus storage volumes. Actions: list, get, create, delete, clone.",
    {
      action: z.enum(["list", "get", "create", "delete", "clone"]).describe("The action to perform"),
      volumeId: z.string().optional().describe("Volume ID (required for get, delete, clone)"),
      name: z.string().optional().describe("Volume name (required for create and clone)"),
      type: z.enum(["ledger", "workspace"]).optional().describe("Volume type (required for create)"),
      template: z.string().optional().describe("Template to seed the volume from (optional for create)"),
      description: z.string().optional().describe("Volume description"),
    },
    async (args) => {
      const { action, volumeId, name, type, template, description } = args;

      switch (action) {
        case "list":
          return apiCall("/api/volumes", { query: { type } });

        case "get": {
          if (!volumeId) return errorResponse("'volumeId' is required for get action.");
          return apiCall(`/api/volumes/${volumeId}`);
        }

        case "create": {
          if (!name || !type) return errorResponse("'name' and 'type' are required for create action.");
          return apiCall("/api/volumes", {
            method: "POST",
            body: { name, type, template, description },
          });
        }

        case "delete": {
          if (!volumeId) return errorResponse("'volumeId' is required for delete action.");
          return apiCall(`/api/volumes/${volumeId}`, { method: "DELETE" });
        }

        case "clone": {
          if (!volumeId) return errorResponse("'volumeId' is required for clone action.");
          if (!name) return errorResponse("'name' is required for clone action.");
          return apiCall(`/api/volumes/${volumeId}/clone`, {
            method: "POST",
            body: { name, description },
          });
        }
      }
    }
  );
}
