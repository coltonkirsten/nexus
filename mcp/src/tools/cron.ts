import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall, errorResponse } from "../api.js";

export function registerCronTools(server: McpServer): void {
  server.tool(
    "manage_cron",
    "Manage scheduled/cron jobs for an agent. Actions: list, create, update, delete, trigger.",
    {
      action: z.enum(["list", "create", "update", "delete", "trigger"]).describe("The action to perform"),
      agentId: z.string().describe("The agent ID"),
      jobId: z.string().optional().describe("Job ID (required for update, delete, trigger)"),
      name: z.string().optional().describe("Job name (required for create)"),
      scheduleType: z.enum(["cron", "at", "every"]).optional().describe("Schedule type (required for create)"),
      scheduleValue: z.string().optional().describe("Schedule value. For 'cron': expression like '0 9 * * *'. For 'at': ISO 8601 datetime. For 'every': interval in ms (min 60000)."),
      timezone: z.string().optional().describe("IANA timezone for cron schedules"),
      message: z.string().optional().describe("Message content sent to the agent when the job fires"),
      enabled: z.boolean().optional().describe("Enable/disable job (for update action)"),
    },
    async (args) => {
      const { action, agentId, jobId, name, scheduleType, scheduleValue, timezone, message, enabled } = args;

      switch (action) {
        case "list":
          return apiCall(`/api/agents/${agentId}/cron`);

        case "create": {
          if (!name || !scheduleType || !scheduleValue || !message) {
            return errorResponse("'name', 'scheduleType', 'scheduleValue', and 'message' are required for create action.");
          }
          let schedule: Record<string, unknown>;
          switch (scheduleType) {
            case "cron": schedule = { kind: "cron", expression: scheduleValue, timezone }; break;
            case "at": schedule = { kind: "at", datetime: scheduleValue }; break;
            case "every": schedule = { kind: "every", intervalMs: parseInt(scheduleValue) }; break;
          }
          return apiCall(`/api/agents/${agentId}/cron`, {
            method: "POST",
            body: { name, schedule, message, createdBy: "user" },
          });
        }

        case "update": {
          if (!jobId) return errorResponse("'jobId' is required for update action.");
          const updateBody: Record<string, unknown> = {};
          if (name !== undefined) updateBody.name = name;
          if (message !== undefined) updateBody.message = message;
          if (enabled !== undefined) updateBody.enabled = enabled;
          if (scheduleType && scheduleValue) {
            switch (scheduleType) {
              case "cron": updateBody.schedule = { kind: "cron", expression: scheduleValue, timezone }; break;
              case "at": updateBody.schedule = { kind: "at", datetime: scheduleValue }; break;
              case "every": updateBody.schedule = { kind: "every", intervalMs: parseInt(scheduleValue) }; break;
            }
          }
          return apiCall(`/api/agents/${agentId}/cron/${jobId}`, {
            method: "PATCH",
            body: updateBody,
          });
        }

        case "delete": {
          if (!jobId) return errorResponse("'jobId' is required for delete action.");
          return apiCall(`/api/agents/${agentId}/cron/${jobId}`, { method: "DELETE" });
        }

        case "trigger": {
          if (!jobId) return errorResponse("'jobId' is required for trigger action.");
          return apiCall(`/api/agents/${agentId}/cron/${jobId}/trigger`, { method: "POST" });
        }
      }
    }
  );

  server.tool(
    "get_cron_history",
    "Get the execution history for an agent's cron jobs.",
    {
      agentId: z.string().describe("The agent ID"),
    },
    async ({ agentId }) => apiCall(`/api/agents/${agentId}/cron-history`)
  );
}
