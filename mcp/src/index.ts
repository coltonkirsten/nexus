import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerAgentTools } from "./tools/agents.js";
import { registerMessagingTools } from "./tools/messaging.js";
import { registerFileTools } from "./tools/files.js";
import { registerSkillTools } from "./tools/skills.js";
import { registerCronTools } from "./tools/cron.js";
import { registerTeamTools } from "./tools/teams.js";
import { registerMailboxTools } from "./tools/mailbox.js";
import { registerVolumeTools } from "./tools/volumes.js";
import { registerHistoryTools } from "./tools/history.js";
import { registerCellTypeTools } from "./tools/cellTypes.js";

const server = new McpServer({
  name: "nexus",
  version: "1.0.0",
});

registerAgentTools(server);
registerMessagingTools(server);
registerFileTools(server);
registerSkillTools(server);
registerCronTools(server);
registerTeamTools(server);
registerMailboxTools(server);
registerVolumeTools(server);
registerHistoryTools(server);
registerCellTypeTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Nexus MCP server error:", err);
  process.exit(1);
});
