import { listAgents, updateAgent, getAgent } from './agents.js';
import { getContainerStatus, startContainer, recreateContainer } from './docker.js';
import { startConsumer } from './queueConsumer.js';
import { getAgentVolumes } from './volumes.js';
import { getTeam } from './teams.js';
import type { HealthStatus } from '../types.js';

// Health check configuration
const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
const HEALTH_CHECK_MAX_FAILURES = 3;

// Auto-restart configuration
const AUTO_RESTART_MAX_ATTEMPTS = 3;
const AUTO_RESTART_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// In-memory tracking
const healthFailures: Map<string, number> = new Map();

// Track restart attempts: agentId -> array of timestamps
const restartAttempts: Map<string, number[]> = new Map();

let healthCheckIntervalId: NodeJS.Timeout | null = null;

/**
 * Check health of a single agent by calling its /health endpoint.
 */
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

/**
 * Update the agent's health status in the store.
 */
async function updateAgentHealthStatus(
  agentId: string,
  healthStatus: HealthStatus,
  healthFailures: number = 0
): Promise<void> {
  await updateAgent(agentId, { healthStatus, healthFailures });
}

/**
 * Wait for an agent's engine to become healthy.
 */
async function waitForHealthy(port: number, maxAttempts = 30, intervalMs = 1000): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`http://localhost:${port}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) return true;
    } catch {
      // Not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

/**
 * Check if we can attempt an auto-restart (haven't exceeded max attempts in window).
 */
function canAutoRestart(agentId: string): boolean {
  const now = Date.now();
  const attempts = restartAttempts.get(agentId) || [];

  // Filter to attempts within the window
  const recentAttempts = attempts.filter(ts => now - ts < AUTO_RESTART_WINDOW_MS);
  restartAttempts.set(agentId, recentAttempts);

  return recentAttempts.length < AUTO_RESTART_MAX_ATTEMPTS;
}

/**
 * Record a restart attempt for an agent.
 */
function recordRestartAttempt(agentId: string): void {
  const attempts = restartAttempts.get(agentId) || [];
  attempts.push(Date.now());
  restartAttempts.set(agentId, attempts);
}

/**
 * Attempt to restart an agent's container.
 */
async function attemptAutoRestart(agentId: string): Promise<boolean> {
  const agent = await getAgent(agentId);
  if (!agent) return false;

  console.log(`[Health Check] Attempting auto-restart for agent ${agent.name} (${agentId})`);

  try {
    // Record the attempt
    recordRestartAttempt(agentId);

    // Update agent state to reflect the crash
    const currentRestartCount = agent.restartCount || 0;
    await updateAgent(agentId, {
      status: 'starting',
      restartCount: currentRestartCount + 1,
      lastCrashTime: new Date().toISOString(),
    });

    // Try to start existing container first
    try {
      await startContainer(agentId);
    } catch {
      // Container missing or damaged, recreate it
      const { ledger, workspace } = await getAgentVolumes(agentId);
      const team = agent.teamId ? await getTeam(agent.teamId) : null;

      const containerId = await recreateContainer({
        agentId,
        agentName: agent.name,
        port: agent.port!,
        cellType: agent.cellType,
        ledgerVolume: ledger?.dockerVolume,
        workspaceVolume: workspace?.dockerVolume,
        sharedVolume: team?.sharedVolume,
        teamId: agent.teamId,
      });

      await updateAgent(agentId, { containerId });
      await startContainer(agentId);
    }

    // Wait for engine to become healthy
    const healthy = await waitForHealthy(agent.port!);

    if (healthy) {
      await updateAgent(agentId, {
        status: 'running',
        startedAt: new Date().toISOString(),
      });

      // Restart the queue consumer
      startConsumer(agentId);

      console.log(`[Health Check] Auto-restart successful for agent ${agent.name} (${agentId})`);
      return true;
    } else {
      await updateAgent(agentId, { status: 'error' });
      console.error(`[Health Check] Auto-restart failed for agent ${agent.name} - engine not healthy`);
      return false;
    }
  } catch (error) {
    console.error(`[Health Check] Auto-restart failed for agent ${agent.name}:`, error);
    await updateAgent(agentId, { status: 'error' });
    return false;
  }
}

/**
 * Main health check loop for all agents.
 */
async function runHealthChecks(): Promise<void> {
  try {
    const agents = await listAgents();

    for (const agent of agents) {
      // Skip agents that aren't supposed to be running
      if (agent.status !== 'running' && agent.status !== 'starting') {
        // Reset health status for non-running agents
        if (agent.healthStatus !== 'unknown') {
          await updateAgentHealthStatus(agent.id, 'unknown', 0);
        }
        healthFailures.delete(agent.id);
        continue;
      }

      // Check container status - detect crashed containers
      const containerStatus = await getContainerStatus(agent.id);

      // If agent's status says 'running' but container is not, it crashed
      if (agent.status === 'running' && containerStatus !== 'running') {
        console.warn(`[Health Check] Agent ${agent.name} (${agent.id}) container not running (status: ${containerStatus})`);

        // Check if we can auto-restart
        if (canAutoRestart(agent.id)) {
          const restarted = await attemptAutoRestart(agent.id);
          if (restarted) {
            continue; // Successfully restarted, move to next agent
          }
        } else {
          // Exceeded max restarts, mark as error
          console.error(`[Health Check] Agent ${agent.name} exceeded max auto-restarts, marking as error`);
          await updateAgent(agent.id, {
            status: 'error',
            lastCrashTime: new Date().toISOString(),
          });
          await updateAgentHealthStatus(agent.id, 'unhealthy', HEALTH_CHECK_MAX_FAILURES);
        }
        continue;
      }

      // Only check health endpoint for running agents with valid ports
      if (containerStatus !== 'running' || !agent.port) {
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
          // Mark as unhealthy after consecutive failures
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

/**
 * Start the health check loop.
 */
export function startHealthCheckLoop(): void {
  if (healthCheckIntervalId) {
    console.log('[Health Check] Health check loop already running');
    return;
  }

  console.log(`[Health Check] Starting health check loop (interval: ${HEALTH_CHECK_INTERVAL_MS / 1000}s)`);

  // Run initial check after a short delay
  setTimeout(runHealthChecks, 5000);

  // Start the interval
  healthCheckIntervalId = setInterval(runHealthChecks, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Stop the health check loop.
 */
export function stopHealthCheckLoop(): void {
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
    console.log('[Health Check] Health check loop stopped');
  }
}

/**
 * Get the number of recent restart attempts for an agent.
 */
export function getRestartAttemptCount(agentId: string): number {
  const now = Date.now();
  const attempts = restartAttempts.get(agentId) || [];
  return attempts.filter(ts => now - ts < AUTO_RESTART_WINDOW_MS).length;
}

/**
 * Clear restart attempt history for an agent (e.g., when manually restarted).
 */
export function clearRestartAttempts(agentId: string): void {
  restartAttempts.delete(agentId);
}
