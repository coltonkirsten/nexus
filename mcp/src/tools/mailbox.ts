import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall, errorResponse } from "../api.js";

export function registerMailboxTools(server: McpServer): void {
  server.tool(
    "send_mail",
    "Send a mail message from a human to an agent via the team mailbox. The message will also be enqueued for the agent to process.",
    {
      teamId: z.string().describe("The team ID"),
      agentId: z.string().describe("The target agent ID"),
      subject: z.string().describe("Mail subject line"),
      body: z.string().describe("Mail body content"),
      replyToId: z.string().optional().describe("ID of a previous mail message to reply to"),
    },
    async ({ teamId, ...body }) =>
      apiCall(`/api/teams/${teamId}/mailbox`, { method: "POST", body })
  );

  server.tool(
    "get_mailbox",
    "Manage the team mailbox. Actions: list (view messages), mark_read, mark_all_read, unread_counts.",
    {
      action: z.enum(["list", "mark_read", "mark_all_read", "unread_counts"]).describe("The action to perform"),
      teamId: z.string().optional().describe("Team ID (required for list, mark_read, mark_all_read)"),
      messageId: z.string().optional().describe("Message ID (required for mark_read)"),
      direction: z.enum(["agent_to_human", "human_to_agent"]).optional().describe("Filter messages by direction (for list)"),
      unreadOnly: z.boolean().optional().describe("Only show unread messages (for list)"),
    },
    async (args) => {
      const { action, teamId, messageId, direction, unreadOnly } = args;

      switch (action) {
        case "list": {
          if (!teamId) return errorResponse("'teamId' is required for list action.");
          return apiCall(`/api/teams/${teamId}/mailbox`, {
            query: {
              direction,
              unreadOnly: unreadOnly ? "true" : undefined,
            },
          });
        }

        case "mark_read": {
          if (!teamId) return errorResponse("'teamId' is required for mark_read action.");
          if (!messageId) return errorResponse("'messageId' is required for mark_read action.");
          return apiCall(`/api/teams/${teamId}/mailbox/${messageId}/read`, { method: "PATCH" });
        }

        case "mark_all_read": {
          if (!teamId) return errorResponse("'teamId' is required for mark_all_read action.");
          return apiCall(`/api/teams/${teamId}/mailbox/mark-all-read`, { method: "POST" });
        }

        case "unread_counts":
          return apiCall("/api/teams/mailbox/unread-counts");
      }
    }
  );
}
