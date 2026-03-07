import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall, errorResponse } from "../api.js";

export function registerBoardTools(server: McpServer): void {
  // Board management tool
  server.tool(
    "board_manage",
    "Manage kanban boards for a team. Actions: list, get, create, delete.",
    {
      action: z.enum(["list", "get", "create", "delete"]).describe("The action to perform"),
      teamId: z.string().describe("The team ID"),
      boardId: z.string().optional().describe("Board ID (required for get, delete)"),
      name: z.string().optional().describe("Board name (required for create)"),
      description: z.string().optional().describe("Board description (optional for create)"),
    },
    async (args) => {
      const { action, teamId, boardId, name, description } = args;

      switch (action) {
        case "list":
          return apiCall(`/api/teams/${teamId}/boards`);

        case "get": {
          if (!boardId) return errorResponse("'boardId' is required for get action.");
          return apiCall(`/api/teams/${teamId}/boards/${boardId}`);
        }

        case "create": {
          if (!name) return errorResponse("'name' is required for create action.");
          return apiCall(`/api/teams/${teamId}/boards`, {
            method: "POST",
            body: { name, description },
          });
        }

        case "delete": {
          if (!boardId) return errorResponse("'boardId' is required for delete action.");
          return apiCall(`/api/teams/${teamId}/boards/${boardId}`, { method: "DELETE" });
        }
      }
    }
  );

  // Card management tool
  server.tool(
    "card_manage",
    "Manage kanban cards. Actions: create, get, update, delete, move.",
    {
      action: z.enum(["create", "get", "update", "delete", "move"]).describe("The action to perform"),
      teamId: z.string().describe("The team ID"),
      boardId: z.string().describe("The board ID"),
      cardId: z.string().optional().describe("Card ID (required for get, update, delete, move)"),
      columnId: z.string().optional().describe("Column ID (required for create, move target)"),
      title: z.string().optional().describe("Card title (required for create)"),
      description: z.string().optional().describe("Card description"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Card priority"),
      assigneeId: z.string().optional().describe("Agent ID to assign the card to"),
      assigneeName: z.string().optional().describe("Name of the assignee"),
      dueDate: z.string().optional().describe("Due date in ISO format"),
      labels: z.array(z.string()).optional().describe("Array of label strings"),
      position: z.number().optional().describe("Position in target column (for move)"),
    },
    async (args) => {
      const {
        action, teamId, boardId, cardId, columnId,
        title, description, priority, assigneeId, assigneeName, dueDate, labels, position
      } = args;

      switch (action) {
        case "create": {
          if (!columnId) return errorResponse("'columnId' is required for create action.");
          if (!title) return errorResponse("'title' is required for create action.");

          const body: Record<string, unknown> = { columnId, title };
          if (description) body.description = description;
          if (priority) body.priority = priority;
          if (assigneeId) body.assigneeId = assigneeId;
          if (assigneeName) body.assigneeName = assigneeName;
          if (dueDate) body.dueDate = dueDate;
          if (labels) body.labels = labels;

          return apiCall(`/api/teams/${teamId}/boards/${boardId}/cards`, {
            method: "POST",
            body,
          });
        }

        case "get": {
          if (!cardId) return errorResponse("'cardId' is required for get action.");
          // Get the full board and find the card (API doesn't have single card endpoint)
          const result = await apiCall(`/api/teams/${teamId}/boards/${boardId}`);
          const text = result.content[0]?.text || "";
          if (!text.startsWith("Error:")) {
            try {
              const board = JSON.parse(text).board;
              for (const col of board.columns) {
                const card = col.cards.find((c: { id: string }) => c.id === cardId);
                if (card) {
                  return {
                    content: [{ type: "text" as const, text: JSON.stringify({ card, columnId: col.id, columnName: col.name }, null, 2) }],
                  };
                }
              }
              return errorResponse(`Card '${cardId}' not found in board.`);
            } catch {
              return result;
            }
          }
          return result;
        }

        case "update": {
          if (!cardId) return errorResponse("'cardId' is required for update action.");

          const body: Record<string, unknown> = {};
          if (title !== undefined) body.title = title;
          if (description !== undefined) body.description = description;
          if (priority !== undefined) body.priority = priority;
          if (assigneeId !== undefined) body.assigneeId = assigneeId;
          if (assigneeName !== undefined) body.assigneeName = assigneeName;
          if (dueDate !== undefined) body.dueDate = dueDate;
          if (labels !== undefined) body.labels = labels;

          return apiCall(`/api/teams/${teamId}/boards/${boardId}/cards/${cardId}`, {
            method: "PATCH",
            body,
          });
        }

        case "delete": {
          if (!cardId) return errorResponse("'cardId' is required for delete action.");
          return apiCall(`/api/teams/${teamId}/boards/${boardId}/cards/${cardId}`, {
            method: "DELETE",
          });
        }

        case "move": {
          if (!cardId) return errorResponse("'cardId' is required for move action.");
          if (!columnId) return errorResponse("'columnId' (target column) is required for move action.");

          const body: Record<string, unknown> = { targetColumnId: columnId };
          if (position !== undefined) body.position = position;

          return apiCall(`/api/teams/${teamId}/boards/${boardId}/cards/${cardId}/move`, {
            method: "POST",
            body,
          });
        }
      }
    }
  );

  // Column management tool
  server.tool(
    "column_manage",
    "Manage kanban columns in a board. Actions: create, update, delete, reorder.",
    {
      action: z.enum(["create", "update", "delete", "reorder"]).describe("The action to perform"),
      teamId: z.string().describe("The team ID"),
      boardId: z.string().describe("The board ID"),
      columnId: z.string().optional().describe("Column ID (required for update, delete)"),
      name: z.string().optional().describe("Column name (required for create)"),
      position: z.number().optional().describe("Column position"),
      columnOrder: z.array(z.string()).optional().describe("Array of column IDs in new order (for reorder)"),
    },
    async (args) => {
      const { action, teamId, boardId, columnId, name, position, columnOrder } = args;

      switch (action) {
        case "create": {
          if (!name) return errorResponse("'name' is required for create action.");
          return apiCall(`/api/teams/${teamId}/boards/${boardId}/columns`, {
            method: "POST",
            body: { name, position },
          });
        }

        case "update": {
          if (!columnId) return errorResponse("'columnId' is required for update action.");
          const body: Record<string, unknown> = {};
          if (name !== undefined) body.name = name;
          if (position !== undefined) body.position = position;
          return apiCall(`/api/teams/${teamId}/boards/${boardId}/columns/${columnId}`, {
            method: "PATCH",
            body,
          });
        }

        case "delete": {
          if (!columnId) return errorResponse("'columnId' is required for delete action.");
          return apiCall(`/api/teams/${teamId}/boards/${boardId}/columns/${columnId}`, {
            method: "DELETE",
          });
        }

        case "reorder": {
          if (!columnOrder) return errorResponse("'columnOrder' is required for reorder action.");
          return apiCall(`/api/teams/${teamId}/boards/${boardId}/columns/reorder`, {
            method: "POST",
            body: { columnOrder },
          });
        }
      }
    }
  );
}
