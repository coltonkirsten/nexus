import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../api.js";

export function registerCellTypeTools(server: McpServer): void {
  server.tool(
    "list_cell_types",
    "List all available cell types that can be used when creating agents.",
    {},
    async () => apiCall("/api/cell-types")
  );
}
