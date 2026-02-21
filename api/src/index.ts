import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Load .env from parent directory (NEXUS root)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

// Global handlers to prevent crashes from unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  // Don't exit - let pm2 handle restarts if needed
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - let pm2 handle restarts if needed
});

import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import agentsRouter from './routes/agents.js';
import volumesRouter from './routes/volumes.js';
import teamsRouter from './routes/teams.js';
import cellTypesRouter from './routes/cellTypes.js';
import mailboxRouter from './routes/mailbox.js';
import { recoverAllStuckMessages } from './services/agents.js';
import { restartConsumersForRunningAgents } from './services/queueConsumer.js';
import { handleTerminalConnection } from './services/terminal.js';
import { initScheduler } from './services/cronScheduler.js';
import { migrateFromEnv } from './services/credentials.js';
import { startHealthCheckLoop } from './services/healthCheck.js';
import { startOAuthSyncLoop } from './services/oauthSync.js';

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'nexus-api',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/agents', agentsRouter);
app.use('/api/volumes', volumesRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/teams', mailboxRouter);
app.use('/api/cell-types', cellTypesRouter);
// Credential routes are mounted under cell-types router (/api/cell-types/credentials/...)


// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Startup initialization
async function initialize(): Promise<void> {
  try {
    // Migrate credentials from env to credential store (backward compat)
    console.log('[Startup] Checking credential migration...');
    await migrateFromEnv();

    // Recover any messages stuck in "processing" state from previous run
    console.log('[Startup] Checking for stuck messages to recover...');
    await recoverAllStuckMessages();
    console.log('[Startup] Queue recovery complete');

    // Initialize cron job scheduler
    console.log('[Startup] Initializing cron scheduler...');
    await initScheduler();
    console.log('[Startup] Cron scheduler initialized');

    // Restart queue consumers for any agents that are still running
    await restartConsumersForRunningAgents();

    // Start OAuth token sync loop (checks macOS keychain for fresh tokens)
    console.log('[Startup] Starting OAuth sync loop...');
    startOAuthSyncLoop();
  } catch (error) {
    console.error('[Startup] Error during initialization:', error);
  }
}

// Create HTTP server from Express app
const server = createServer(app);

// WebSocket server for terminal connections
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://localhost:${PORT}`);
  const match = url.pathname.match(/^\/api\/agents\/([^/]+)\/terminal$/);

  if (match) {
    const agentId = match[1];
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleTerminalConnection(ws, agentId);
    });
  } else {
    socket.destroy();
  }
});

// Start server
server.listen(PORT, async () => {
  console.log(`NEXUS API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Agents API: http://localhost:${PORT}/api/agents`);
  console.log(`WebSocket terminal: ws://localhost:${PORT}/api/agents/:id/terminal`);

  // Run startup initialization
  await initialize();

  // Start health check loop
  startHealthCheckLoop();
});

export default app;
