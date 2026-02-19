import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Load .env from parent directory (NEXUS root)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import agentsRouter from './routes/agents.js';
import volumesRouter from './routes/volumes.js';
import teamsRouter from './routes/teams.js';
import { listAgents, updateAgentHealthStatus, recoverAllStuckMessages } from './services/agents.js';
import { restartConsumersForRunningAgents } from './services/queueConsumer.js';
import { handleTerminalConnection } from './services/terminal.js';
import { initScheduler } from './services/cronScheduler.js';
import type { HealthStatus } from './types.js';

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

// Health check configuration
const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
const HEALTH_CHECK_MAX_FAILURES = 3;

// In-memory failure tracking: agentId -> consecutive failure count
const healthFailures: Map<string, number> = new Map();

// Check health of a single agent container
async function checkAgentHealth(agentId: string, port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://localhost:${port}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

// Health check loop for all running agents
async function runHealthChecks(): Promise<void> {
  try {
    const agents = await listAgents();

    for (const agent of agents) {
      // Only check running agents with valid ports
      if (agent.status !== 'running' || !agent.port) {
        // Reset health status for non-running agents
        if (agent.healthStatus !== 'unknown') {
          await updateAgentHealthStatus(agent.id, 'unknown', 0);
        }
        healthFailures.delete(agent.id);
        continue;
      }

      const isHealthy = await checkAgentHealth(agent.id, agent.port);

      if (isHealthy) {
        // Reset failure count and mark as healthy
        healthFailures.delete(agent.id);
        if (agent.healthStatus !== 'healthy') {
          await updateAgentHealthStatus(agent.id, 'healthy', 0);
          console.log(`[Health Check] Agent ${agent.name} (${agent.id}) is healthy`);
        }
      } else {
        // Increment failure count
        const failures = (healthFailures.get(agent.id) || 0) + 1;
        healthFailures.set(agent.id, failures);

        if (failures >= HEALTH_CHECK_MAX_FAILURES) {
          // Mark as unhealthy after 3 consecutive failures
          if (agent.healthStatus !== 'unhealthy') {
            await updateAgentHealthStatus(agent.id, 'unhealthy', failures);
            console.warn(`[Health Check] Agent ${agent.name} (${agent.id}) marked UNHEALTHY after ${failures} failed checks`);
          }
        } else {
          console.log(`[Health Check] Agent ${agent.name} (${agent.id}) health check failed (${failures}/${HEALTH_CHECK_MAX_FAILURES})`);
        }
      }
    }
  } catch (error) {
    console.error('[Health Check] Error running health checks:', error);
  }
}

// Start the health check loop
function startHealthCheckLoop(): void {
  console.log(`[Health Check] Starting health check loop (interval: ${HEALTH_CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(runHealthChecks, HEALTH_CHECK_INTERVAL_MS);
  // Run initial check after a short delay to let server stabilize
  setTimeout(runHealthChecks, 5000);
}

// Startup initialization
async function initialize(): Promise<void> {
  try {
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
