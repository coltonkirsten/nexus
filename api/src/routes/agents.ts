import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import {
  createAgent,
  getAgent,
  listAgents,
  deleteAgent,
  updateAgent,
  enqueueMessage,
  getQueue,
  getQueueStats,
  updateMessageStatus,
} from '../services/agents.js';
import {
  createAgentContainer,
  recreateContainer,
  startContainer,
  stopContainer,
  removeContainer,
  getContainerStatus,
  getContainerLogs,
} from '../services/docker.js';
import { sendMessage, getHealth, streamLogs, getSession, clearSession } from '../services/engine.js';
import { startConsumer, stopConsumer, notifyNewMessage } from '../services/queueConsumer.js';
import { broadcastPeers } from '../services/peers.js';
import {
  initializeAgent,
  readFile_ as readVolumeFile,
  writeFile_ as writeVolumeFile,
  listDirectory as listVolumeDirectory,
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
} from '../services/volume.js';
import {
  createVolume,
  getVolume,
  attachVolume,
  detachVolume,
  deleteVolume,
  getAgentVolumes,
} from '../services/volumes.js';
import { emitTeamEvent, getTeam } from '../services/teams.js';
import {
  createCronJob as createCronJobStorage,
  getCronJob,
  listCronJobsForAgent,
  updateCronJob as updateCronJobStorage,
  deleteCronJob as deleteCronJobStorage,
  deleteAllCronJobsForAgent,
  getCronHistory,
} from '../services/cron.js';
import {
  scheduleJob,
  unscheduleJob,
  rescheduleJob,
  getNextRunTime,
  executeJob,
} from '../services/cronScheduler.js';
import { v4 as uuidv4 } from 'uuid';
import type { AgentConfig, MessageStatus, Schedule } from '../types.js';

const router = Router();

// Rate limiting configuration
const RATE_LIMIT_MAX_MESSAGES = 10; // Max messages per minute per agent
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window

// In-memory rate limiting storage: agentId -> { count, windowStart }
interface RateLimitEntry {
  count: number;
  windowStart: number;
}
const rateLimitStore: Map<string, RateLimitEntry> = new Map();

// Check rate limit for an agent, returns true if allowed, false if exceeded
function checkRateLimit(agentId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(agentId);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // New window or expired window - reset
    rateLimitStore.set(agentId, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX_MESSAGES - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }

  if (entry.count >= RATE_LIMIT_MAX_MESSAGES) {
    // Rate limit exceeded
    const resetIn = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, remaining: 0, resetIn };
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(agentId, entry);
  const resetIn = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
  return { allowed: true, remaining: RATE_LIMIT_MAX_MESSAGES - entry.count, resetIn };
}

import { Cron } from 'croner';

function validateSchedule(schedule: Schedule): string | null {
  if (!schedule || !schedule.kind) return 'Schedule is required with a kind field';

  if (schedule.kind === 'cron') {
    if (!schedule.expression) return 'Cron expression is required';
    try {
      new Cron(schedule.expression, { timezone: schedule.timezone });
    } catch (e) {
      return `Invalid cron expression: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else if (schedule.kind === 'at') {
    if (!schedule.datetime) return 'Datetime is required for at schedule';
    const date = new Date(schedule.datetime);
    if (isNaN(date.getTime())) return 'Invalid datetime format';
    if (date.getTime() <= Date.now()) return 'Datetime must be in the future';
  } else if (schedule.kind === 'every') {
    if (!schedule.intervalMs || schedule.intervalMs < 60000) {
      return 'Interval must be at least 60000ms (1 minute)';
    }
  } else {
    return 'Invalid schedule kind. Must be cron, at, or every';
  }
  return null;
}

// Wait for the engine inside a container to become healthy
async function waitForHealthy(agentId: string, port: number, maxAttempts = 30, intervalMs = 1000): Promise<boolean> {
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

// GET /api/agents - List all agents with status
router.get('/', async (_req: Request, res: Response) => {
  try {
    const agents = await listAgents();

    // Enrich with current container status
    const enrichedAgents = await Promise.all(
      agents.map(async agent => {
        const status = await getContainerStatus(agent.id);
        return { ...agent, status };
      })
    );

    res.json({ agents: enrichedAgents });
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// GET /api/agents/:id - Get single agent with container status
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const status = await getContainerStatus(id);
    res.json({ agent: { ...agent, status } });
  } catch (error) {
    console.error('Error getting agent:', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// POST /api/agents - Create agent
router.post('/', async (req: Request, res: Response) => {
  try {
    const config: AgentConfig = req.body;

    if (!config.name) {
      res.status(400).json({ error: 'Agent name is required' });
      return;
    }

    const agent = await createAgent(config);

    let ledgerVol: Awaited<ReturnType<typeof createVolume>> | undefined;
    let workspaceVol: Awaited<ReturnType<typeof createVolume>> | undefined;
    let containerId: string | undefined;

    try {
      // Create ledger and workspace volumes
      ledgerVol = await createVolume(`${config.name}-ledger`, 'ledger');
      workspaceVol = await createVolume(`${config.name}-workspace`, 'workspace');

      // Attach volumes to agent
      await attachVolume(ledgerVol.id, agent.id);
      await attachVolume(workspaceVol.id, agent.id);
      await updateAgent(agent.id, {
        ledgerVolumeId: ledgerVol.id,
        workspaceVolumeId: workspaceVol.id,
      });

      // Create Docker container with volume mounts
      containerId = await createAgentContainer({
        agentId: agent.id,
        agentName: config.name,
        port: agent.port!,
        cellType: agent.cellType,
        ledgerVolume: ledgerVol.dockerVolume,
        workspaceVolume: workspaceVol.dockerVolume,
      });
    } catch (innerErr) {
      // Rollback: clean up any resources created before the failure
      console.error(`Agent creation failed for ${agent.id}, rolling back:`, innerErr);
      if (containerId) {
        try { await removeContainer(agent.id); } catch { /* best-effort */ }
      }
      if (workspaceVol) {
        try { await detachVolume(workspaceVol.id); } catch { /* best-effort */ }
        try { await deleteVolume(workspaceVol.id); } catch { /* best-effort */ }
      }
      if (ledgerVol) {
        try { await detachVolume(ledgerVol.id); } catch { /* best-effort */ }
        try { await deleteVolume(ledgerVol.id); } catch { /* best-effort */ }
      }
      await deleteAgent(agent.id);
      throw innerErr;
    }

    // Template seeding happens at start time via engine /init endpoint
    await updateAgent(agent.id, { containerId });

    res.status(201).json({ agent: { ...agent, containerId, ledgerVolumeId: ledgerVol.id, workspaceVolumeId: workspaceVol.id } });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// PATCH /api/agents/:id - Update agent (rename, config)
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, config: agentConfig } = req.body;

    const agent = await getAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (name && typeof name === 'string') {
      updates.name = name;
    }
    if (agentConfig && typeof agentConfig === 'object') {
      updates.config = agentConfig;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const updated = await updateAgent(id, updates);
    res.json({ agent: updated });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/agents/:id - Delete agent
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleteVolumes = req.query.deleteVolumes === 'true';
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const warnings: string[] = [];

    // Emit team event before deletion
    if (agent.teamId) {
      try {
        await emitTeamEvent({
          id: uuidv4(),
          teamId: agent.teamId,
          type: 'agent_deleted',
          timestamp: new Date().toISOString(),
          agentId: id,
          agentName: agent.name,
        });
      } catch { /* best-effort */ }
      // Clear teamId so the agent isn't counted as a team member
      try { await updateAgent(id, { teamId: undefined }); } catch { /* best-effort */ }
    }

    // Stop queue consumer
    try { await stopConsumer(id); } catch { /* non-critical */ }

    // Clean up cron jobs
    try {
      const cronJobs = await listCronJobsForAgent(id);
      for (const job of cronJobs) {
        unscheduleJob(job.id);
      }
      await deleteAllCronJobsForAgent(id);
    } catch { /* non-critical */ }

    // Remove container first
    try {
      await removeContainer(id);
    } catch (err) {
      const msg = `Failed to remove container for agent ${id}: ${err instanceof Error ? err.message : err}`;
      console.error(msg);
      warnings.push(msg);
    }

    // Detach volumes (and optionally delete them)
    const { ledger, workspace } = await getAgentVolumes(id);
    if (ledger) {
      try {
        await detachVolume(ledger.id);
      } catch (err) {
        const msg = `Failed to detach ledger volume ${ledger.id}: ${err instanceof Error ? err.message : err}`;
        console.error(msg);
        warnings.push(msg);
      }
      if (deleteVolumes) {
        try {
          await deleteVolume(ledger.id);
        } catch (err) {
          const msg = `Failed to delete ledger volume ${ledger.id}: ${err instanceof Error ? err.message : err}`;
          console.error(msg);
          warnings.push(msg);
        }
      }
    }
    if (workspace) {
      try {
        await detachVolume(workspace.id);
      } catch (err) {
        const msg = `Failed to detach workspace volume ${workspace.id}: ${err instanceof Error ? err.message : err}`;
        console.error(msg);
        warnings.push(msg);
      }
      if (deleteVolumes) {
        try {
          await deleteVolume(workspace.id);
        } catch (err) {
          const msg = `Failed to delete workspace volume ${workspace.id}: ${err instanceof Error ? err.message : err}`;
          console.error(msg);
          warnings.push(msg);
        }
      }
    }

    // Delete agent record (always — so user isn't stuck with undeletable agent)
    const deleted = await deleteAgent(id);

    if (deleted) {
      // Broadcast updated peer list to remaining running agents
      await broadcastPeers();

      const message = deleteVolumes
        ? 'Agent and volumes deleted'
        : 'Agent deleted. Volumes preserved and can be attached to other agents.';
      const response: { success: boolean; message: string; warnings?: string[] } = { success: true, message };
      if (warnings.length > 0) response.warnings = warnings;
      res.json(response);
    } else {
      res.status(500).json({ error: 'Failed to delete agent' });
    }
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// POST /api/agents/:id/start - Start agent container
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    await updateAgent(id, { status: 'starting' });

    // Try to start existing container; if missing, recreate it
    try {
      await startContainer(id);
    } catch {
      // Container missing — recreate from scratch
      const { ledger, workspace } = await getAgentVolumes(id);
      const team = agent.teamId ? await getTeam(agent.teamId) : null;
      const containerId = await recreateContainer({
        agentId: id,
        agentName: agent.name,
        port: agent.port!,
        cellType: agent.cellType,
        ledgerVolume: ledger?.dockerVolume,
        workspaceVolume: workspace?.dockerVolume,
        sharedVolume: team?.sharedVolume,
        teamId: agent.teamId,
      });
      await updateAgent(id, { containerId });
      await startContainer(id);
    }

    // Wait for engine to become healthy before initializing
    const healthy = await waitForHealthy(id, agent.port!);
    if (!healthy) {
      await updateAgent(id, { status: 'error' });
      res.status(500).json({ error: 'Engine failed to become healthy after start' });
      return;
    }

    // Initialize ledger from template (idempotent — skips if already initialized)
    try {
      const templateName = agent.template || 'blank';
      await initializeAgent(id, templateName);
    } catch (initError) {
      console.error('Warning: template init failed (non-fatal):', initError);
    }

    await updateAgent(id, { status: 'running' });

    // Start the queue consumer for this agent
    startConsumer(id);

    // Broadcast updated peer list to all running agents
    await broadcastPeers();

    // Emit team event if agent is in a team
    if (agent.teamId) {
      await emitTeamEvent({
        id: uuidv4(),
        teamId: agent.teamId,
        type: 'agent_started',
        timestamp: new Date().toISOString(),
        agentId: id,
        agentName: agent.name,
      });
    }

    res.json({ success: true, message: 'Agent started' });
  } catch (error) {
    console.error('Error starting agent:', error);
    await updateAgent(req.params.id, { status: 'error' });
    res.status(500).json({ error: 'Failed to start agent' });
  }
});

// POST /api/agents/:id/stop - Stop agent container
router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Stop the queue consumer before stopping the container
    await stopConsumer(id);

    await updateAgent(id, { status: 'stopping' });
    await stopContainer(id);
    await updateAgent(id, { status: 'stopped' });

    // Broadcast updated peer list to remaining running agents
    await broadcastPeers();

    // Emit team event if agent is in a team
    if (agent.teamId) {
      await emitTeamEvent({
        id: uuidv4(),
        teamId: agent.teamId,
        type: 'agent_stopped',
        timestamp: new Date().toISOString(),
        agentId: id,
        agentName: agent.name,
      });
    }

    res.json({ success: true, message: 'Agent stopped' });
  } catch (error) {
    console.error('Error stopping agent:', error);
    res.status(500).json({ error: 'Failed to stop agent' });
  }
});

// POST /api/agents/:id/attach - Attach a volume to agent
router.post('/:id/attach', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { volumeId } = req.body;

    if (!volumeId) {
      res.status(400).json({ error: 'volumeId is required' });
      return;
    }

    const agent = await getAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Agent must be stopped
    const status = await getContainerStatus(id);
    if (status === 'running' || status === 'starting') {
      res.status(400).json({ error: 'Agent must be stopped before changing volumes' });
      return;
    }

    const volume = await getVolume(volumeId);
    if (!volume) {
      res.status(404).json({ error: 'Volume not found' });
      return;
    }

    if (volume.attachedTo && volume.attachedTo !== id) {
      res.status(409).json({ error: `Volume is already attached to another agent` });
      return;
    }

    // Determine slot from volume type
    const slot = volume.type; // 'ledger' | 'workspace'

    // Detach existing volume in that slot
    const existingVolId = slot === 'ledger' ? agent.ledgerVolumeId : agent.workspaceVolumeId;
    if (existingVolId && existingVolId !== volumeId) {
      await detachVolume(existingVolId);
    }

    // Attach new volume
    await attachVolume(volumeId, id);

    // Update agent refs
    const agentUpdates: Record<string, unknown> = {};
    if (slot === 'ledger') {
      agentUpdates.ledgerVolumeId = volumeId;
    } else {
      agentUpdates.workspaceVolumeId = volumeId;
    }

    // Recreate container with new mounts
    const { ledger, workspace } = await getAgentVolumes(id);
    // Override with the new attachment
    const ledgerDockerVol = slot === 'ledger' ? volume.dockerVolume : ledger?.dockerVolume;
    const workspaceDockerVol = slot === 'workspace' ? volume.dockerVolume : workspace?.dockerVolume;

    // Look up team shared volume if agent is in a team
    let sharedVolume: string | undefined;
    if (agent.teamId) {
      const team = await getTeam(agent.teamId);
      if (team) sharedVolume = team.sharedVolume;
    }

    const containerId = await recreateContainer({
      agentId: id,
      agentName: agent.name,
      port: agent.port!,
      cellType: agent.cellType,
      ledgerVolume: ledgerDockerVol,
      workspaceVolume: workspaceDockerVol,
      sharedVolume,
    });
    agentUpdates.containerId = containerId;

    await updateAgent(id, agentUpdates);

    res.json({ success: true, message: `${slot} volume attached`, containerId });
  } catch (error) {
    console.error('Error attaching volume:', error);
    // If recreateContainer failed, the agent has no working container
    try { await updateAgent(req.params.id, { status: 'error' }); } catch { /* best-effort */ }
    res.status(500).json({ error: 'Failed to attach volume' });
  }
});

// POST /api/agents/:id/detach - Detach a volume from agent
router.post('/:id/detach', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { slot } = req.body as { slot?: 'ledger' | 'workspace' };

    if (!slot || (slot !== 'ledger' && slot !== 'workspace')) {
      res.status(400).json({ error: 'slot must be "ledger" or "workspace"' });
      return;
    }

    const agent = await getAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Agent must be stopped
    const status = await getContainerStatus(id);
    if (status === 'running' || status === 'starting') {
      res.status(400).json({ error: 'Agent must be stopped before changing volumes' });
      return;
    }

    const volumeId = slot === 'ledger' ? agent.ledgerVolumeId : agent.workspaceVolumeId;
    if (!volumeId) {
      res.status(400).json({ error: `No ${slot} volume attached` });
      return;
    }

    // Detach
    await detachVolume(volumeId);

    // Update agent refs
    const agentUpdates: Record<string, unknown> = {};
    if (slot === 'ledger') {
      agentUpdates.ledgerVolumeId = undefined;
    } else {
      agentUpdates.workspaceVolumeId = undefined;
    }

    // Recreate container without that mount
    const { ledger, workspace } = await getAgentVolumes(id);
    const ledgerDockerVol = slot === 'ledger' ? undefined : ledger?.dockerVolume;
    const workspaceDockerVol = slot === 'workspace' ? undefined : workspace?.dockerVolume;

    // Look up team shared volume if agent is in a team
    let sharedVolume: string | undefined;
    if (agent.teamId) {
      const team = await getTeam(agent.teamId);
      if (team) sharedVolume = team.sharedVolume;
    }

    const containerId = await recreateContainer({
      agentId: id,
      agentName: agent.name,
      port: agent.port!,
      cellType: agent.cellType,
      ledgerVolume: ledgerDockerVol,
      workspaceVolume: workspaceDockerVol,
      sharedVolume,
    });
    agentUpdates.containerId = containerId;

    await updateAgent(id, agentUpdates);

    res.json({ success: true, message: `${slot} volume detached`, containerId });
  } catch (error) {
    console.error('Error detaching volume:', error);
    // If recreateContainer failed, the agent has no working container
    try { await updateAgent(req.params.id, { status: 'error' }); } catch { /* best-effort */ }
    res.status(500).json({ error: 'Failed to detach volume' });
  }
});

// GET /api/agents/:id/status - Get agent status
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const containerStatus = await getContainerStatus(id);
    const health = await getHealth(id);

    res.json({
      agentId: id,
      name: agent.name,
      status: containerStatus,
      health,
      healthStatus: agent.healthStatus || 'unknown',
      port: agent.port,
      createdAt: agent.createdAt,
    });
  } catch (error) {
    console.error('Error getting agent status:', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

// GET /api/agents/:id/session - Get session info (proxy to engine)
router.get('/:id/session', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const result = await getSession(id);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      agentId: id,
      session: result.session,
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// POST /api/agents/:id/session/clear - Clear session (proxy to engine)
router.post('/:id/session/clear', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const result = await clearSession(id);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      message: 'Session cleared',
    });
  } catch (error) {
    console.error('Error clearing session:', error);
    res.status(500).json({ error: 'Failed to clear session' });
  }
});

// POST /api/agents/:id/messages - Send message to agent
router.post('/:id/messages', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message, role = 'user', metadata } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const agent = await getAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Skip rate limiting for agent-to-agent messages
    if (role !== 'agent') {
      const rateLimit = checkRateLimit(id);
      res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_MESSAGES.toString());
      res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetIn / 1000).toString());

      if (!rateLimit.allowed) {
        res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Max ${RATE_LIMIT_MAX_MESSAGES} messages per minute per agent.`,
          retryAfter: Math.ceil(rateLimit.resetIn / 1000),
        });
        return;
      }
    }

    // Require agent to be running
    if (agent.status !== 'running') {
      res.status(400).json({ error: 'Agent is not running. Start the agent first.' });
      return;
    }

    // Record user message in queue
    const enqueuedMessage = await enqueueMessage(id, message, role, metadata);

    // Update lastActivity
    await updateAgent(id, { lastActivity: new Date().toISOString() });

    // Emit team event for inter-agent messages
    if (role === 'agent' && agent.teamId && metadata?.fromAgentId && metadata?.fromAgentName) {
      try {
        await emitTeamEvent({
          id: uuidv4(),
          teamId: agent.teamId,
          type: 'message_sent',
          timestamp: new Date().toISOString(),
          agentId: metadata.fromAgentId as string,
          agentName: metadata.fromAgentName as string,
          data: {
            targetAgentId: id,
            targetAgentName: agent.name,
            messagePreview: message.slice(0, 200),
          },
        });
      } catch { /* best-effort */ }
    }

    // Notify the queue consumer to dispatch this message (or queue it if busy)
    notifyNewMessage(id);

    res.json({
      message: enqueuedMessage,
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/agents/:id/messages - Get message queue/history
router.get('/:id/messages', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const messages = await getQueue(id);
    res.json({ messages });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// GET /api/agents/:id/queue/stats - Get queue statistics
router.get('/:id/queue/stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const stats = await getQueueStats(id);
    res.json({ stats });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// PATCH /api/agents/:id/messages/:messageId/status - Update message status
router.patch('/:id/messages/:messageId/status', async (req: Request, res: Response) => {
  try {
    const { id, messageId } = req.params;
    const { status } = req.body as { status?: MessageStatus };

    if (!status || !['pending', 'processing', 'completed', 'failed'].includes(status)) {
      res.status(400).json({ error: 'Invalid status. Must be "pending", "processing", "completed", or "failed".' });
      return;
    }

    const agent = await getAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const message = await updateMessageStatus(id, messageId, status);
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    res.json({ message });
  } catch (error) {
    console.error('Error updating message status:', error);
    res.status(500).json({ error: 'Failed to update message status' });
  }
});

// GET /api/agents/:id/system-prompt - Get agent's assembled system prompt
router.get('/:id/system-prompt', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Fetch system prompt from engine
    if (agent.port && agent.status === 'running') {
      try {
        const response = await fetch(`http://localhost:${agent.port}/system-prompt`);
        if (response.ok) {
          const data = await response.json();
          res.json(data);
          return;
        }
      } catch {
        // Engine not responding, return default
      }
    }

    // Return default/placeholder
    res.json({
      assembled: 'Agent not running - cannot fetch system prompt',
      identity: '',
      memory: '',
      skills: []
    });
  } catch (error) {
    console.error('Error getting system prompt:', error);
    res.status(500).json({ error: 'Failed to get system prompt' });
  }
});

// GET /api/agents/:id/workspace - Get workspace file tree
router.get('/:id/workspace', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const entries = await listVolumeDirectory(id, '/workspace');
    res.json({ entries });
  } catch (error) {
    console.error('Error getting workspace:', error);
    res.status(500).json({ error: 'Failed to get workspace' });
  }
});

// GET /api/agents/:id/workspace/file - Get workspace file content
router.get('/:id/workspace/file', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path: filePath } = req.query;

    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'File path required' });
      return;
    }

    const agent = await getAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const fullPath = filePath.startsWith('/workspace') ? filePath : `/workspace/${filePath}`;
    const result = await readVolumeFile(id, fullPath);
    if (result === null) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.json({ content: result.content, encoding: result.encoding });
  } catch (error) {
    console.error('Error getting workspace file:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// GET /api/agents/:id/ledger - Get ledger file tree
router.get('/:id/ledger', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const entries = await listVolumeDirectory(id, '/ledger');
    res.json({ entries });
  } catch (error) {
    console.error('Error getting ledger:', error);
    res.status(500).json({ error: 'Failed to get ledger' });
  }
});

// GET /api/agents/:id/ledger/file - Get ledger file content
router.get('/:id/ledger/file', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path: filePath } = req.query;

    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'File path required' });
      return;
    }

    const agent = await getAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const fullPath = filePath.startsWith('/ledger') ? filePath : `/ledger/${filePath}`;
    const result = await readVolumeFile(id, fullPath);
    if (result === null) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.json({ content: result.content, encoding: result.encoding });
  } catch (error) {
    console.error('Error getting ledger file:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// PUT /api/agents/:id/ledger/file - Save ledger file
router.put('/:id/ledger/file', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path: filePath } = req.query;
    const { content } = req.body;

    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'File path required' });
      return;
    }

    const agent = await getAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const fullPath = filePath.startsWith('/ledger') ? filePath : `/ledger/${filePath}`;
    await writeVolumeFile(id, fullPath, content);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving ledger file:', error);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

// GET /api/agents/:id/history - Get invocation history
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Fetch history from engine if running
    if (agent.port && agent.status === 'running') {
      try {
        const response = await fetch(`http://localhost:${agent.port}/logs/history`);
        if (response.ok) {
          const logs = await response.json() as Array<{ type: string; data: unknown; timestamp: string }>;
          // Transform logs into invocation history
          const invocations = [];
          let currentInvocation: {
            id: string;
            timestamp: string;
            input: string;
            result: string;
            status: string;
            durationMs: number;
            tokenUsage: { input: number; output: number };
            costUsd: number;
          } | null = null;

          for (const log of logs) {
            if (log.type === 'agent_start') {
              const data = log.data as { message?: string };
              currentInvocation = {
                id: crypto.randomUUID(),
                timestamp: log.timestamp,
                input: data.message || '',
                result: '',
                status: 'running',
                durationMs: 0,
                tokenUsage: { input: 0, output: 0 },
                costUsd: 0
              };
            } else if (log.type === 'agent_complete' && currentInvocation) {
              currentInvocation.status = 'success';
              invocations.push(currentInvocation);
              currentInvocation = null;
            } else if (log.type === 'agent_error' && currentInvocation) {
              currentInvocation.status = 'error';
              invocations.push(currentInvocation);
              currentInvocation = null;
            } else if (log.type === 'agent_message' && currentInvocation) {
              const data = log.data as { type?: string; message?: { content?: Array<{ text?: string }> }; content?: Array<{ text?: string }>; duration_ms?: number; usage?: { input_tokens?: number; output_tokens?: number }; total_cost_usd?: number; result?: string };
              if (data.type === 'assistant') {
                // Check both data.message.content (SDK format) and data.content (CLI format)
                const contentArr = data.message?.content || data.content;
                if (contentArr?.[0]) {
                  const content = contentArr[0];
                  if ('text' in content) {
                    currentInvocation.result = content.text || '';
                  }
                }
              }
              if (data.type === 'result') {
                currentInvocation.durationMs = data.duration_ms || 0;
                // Check both data.usage (top-level) and data.message-level usage
                const usage = data.usage;
                currentInvocation.tokenUsage = {
                  input: usage?.input_tokens || 0,
                  output: usage?.output_tokens || 0
                };
                currentInvocation.costUsd = data.total_cost_usd || 0;
                currentInvocation.result = data.result || currentInvocation.result;
              }
            }
          }

          // Include in-flight invocation if one exists
          if (currentInvocation) {
            currentInvocation.status = 'running';
            invocations.push(currentInvocation);
          }

          res.json({ invocations });
          return;
        }
      } catch {
        // Engine not responding
      }
    }

    res.json({ invocations: [] });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// POST /api/agents/:id/cancel - Cancel running task (proxy to engine)
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    if (!agent.port || agent.status !== 'running') {
      res.status(400).json({ error: 'Agent is not running' });
      return;
    }

    const response = await fetch(`http://localhost:${agent.port}/cancel`, {
      method: 'POST',
    });

    if (!response.ok) {
      const body = await response.json() as { error?: string };
      res.status(response.status).json(body);
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error cancelling task:', error);
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

// GET /api/agents/:id/logs - SSE stream of agent logs
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Try to get logs from Engine's SSE endpoint first
    const engineLogsResult = await streamLogs(id);

    if (engineLogsResult.stream) {
      // Proxy the engine's log stream
      const reader = engineLogsResult.stream.getReader();
      const decoder = new TextDecoder();

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            res.write(text);
          }
        } catch {
          // Stream ended
        }
      };

      pump();

      req.on('close', () => {
        reader.cancel();
      });
    } else {
      // Fall back to Docker container logs
      try {
        const logStream = await getContainerLogs(id) as Readable;

        logStream.on('data', (chunk: Buffer) => {
          // Docker multiplexes stdout/stderr, strip the 8-byte header
          const data = chunk.length > 8 ? chunk.slice(8) : chunk;
          const logLine = data.toString('utf-8').trim();
          if (logLine) {
            res.write(`data: ${JSON.stringify({ log: logLine, timestamp: new Date().toISOString() })}\n\n`);
          }
        });

        logStream.on('end', () => {
          res.write('event: end\ndata: Log stream ended\n\n');
          res.end();
        });

        logStream.on('error', (err: Error) => {
          res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        });

        req.on('close', () => {
          logStream.destroy();
        });
      } catch (error) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to get container logs' })}\n\n`);
        res.end();
      }
    }
  } catch (error) {
    console.error('Error streaming logs:', error);
    res.status(500).json({ error: 'Failed to stream logs' });
  }
});

// GET /api/agents/:id/skills - List all skills
router.get('/:id/skills', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const skills = await listSkills(id);
    res.json({ skills });
  } catch (error) {
    console.error('Error listing skills:', error);
    res.status(500).json({ error: 'Failed to list skills' });
  }
});

// GET /api/agents/:id/skills/:skillName - Get a specific skill
router.get('/:id/skills/:skillName', async (req: Request, res: Response) => {
  try {
    const { id, skillName } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const skill = await getSkill(id, skillName);

    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    res.json({ skill });
  } catch (error) {
    console.error('Error getting skill:', error);
    res.status(500).json({ error: 'Failed to get skill' });
  }
});

// POST /api/agents/:id/skills - Create a new skill
router.post('/:id/skills', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, content } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Skill name is required' });
      return;
    }

    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const skill = await createSkill(id, name, description || name, content);
    res.status(201).json({ skill });
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// PUT /api/agents/:id/skills/:skillName - Update skill content
router.put('/:id/skills/:skillName', async (req: Request, res: Response) => {
  try {
    const { id, skillName } = req.params;
    const { content } = req.body;

    if (content === undefined) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const skill = await updateSkill(id, skillName, content);

    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    res.json({ skill });
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// DELETE /api/agents/:id/skills/:skillName - Delete a skill
router.delete('/:id/skills/:skillName', async (req: Request, res: Response) => {
  try {
    const { id, skillName } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const deleted = await deleteSkill(id, skillName);

    if (!deleted) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    res.json({ success: true, message: 'Skill deleted' });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

// GET /api/agents/:id/logs/raw - Get raw log history (for team log drill-down)
router.get('/:id/logs/raw', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    if (agent.port && agent.status === 'running') {
      try {
        const response = await fetch(`http://localhost:${agent.port}/logs/history`);
        if (response.ok) {
          const logs = await response.json();
          res.json(logs);
          return;
        }
      } catch {
        // Engine not responding
      }
    }

    res.json([]);
  } catch (error) {
    console.error('Error getting raw logs:', error);
    res.status(500).json({ error: 'Failed to get raw logs' });
  }
});

// --- Cron Job Routes ---

// GET /api/agents/:id/cron - List cron jobs for agent
router.get('/:id/cron', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

    const jobs = await listCronJobsForAgent(id);
    // Enrich with computed nextRunAt
    const enrichedJobs = jobs.map(job => ({
      ...job,
      nextRunAt: job.enabled ? getNextRunTime(job) : undefined,
    }));
    res.json({ jobs: enrichedJobs });
  } catch (error) {
    console.error('Error listing cron jobs:', error);
    res.status(500).json({ error: 'Failed to list cron jobs' });
  }
});

// POST /api/agents/:id/cron - Create cron job
router.post('/:id/cron', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, schedule, message, createdBy = 'user' } = req.body;

    if (!name || !schedule || !message) {
      res.status(400).json({ error: 'name, schedule, and message are required' });
      return;
    }

    const agent = await getAgent(id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

    const validationError = validateSchedule(schedule);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const job = await createCronJobStorage(id, name, schedule, message, createdBy);
    scheduleJob(job);

    res.status(201).json({ job: { ...job, nextRunAt: getNextRunTime(job) } });
  } catch (error) {
    console.error('Error creating cron job:', error);
    res.status(500).json({ error: 'Failed to create cron job' });
  }
});

// GET /api/agents/:id/cron/:jobId - Get single cron job
router.get('/:id/cron/:jobId', async (req: Request, res: Response) => {
  try {
    const { id, jobId } = req.params;
    const agent = await getAgent(id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

    const job = await getCronJob(jobId);
    if (!job || job.agentId !== id) {
      res.status(404).json({ error: 'Cron job not found' });
      return;
    }

    res.json({ job: { ...job, nextRunAt: job.enabled ? getNextRunTime(job) : undefined } });
  } catch (error) {
    console.error('Error getting cron job:', error);
    res.status(500).json({ error: 'Failed to get cron job' });
  }
});

// PATCH /api/agents/:id/cron/:jobId - Update cron job
router.patch('/:id/cron/:jobId', async (req: Request, res: Response) => {
  try {
    const { id, jobId } = req.params;
    const agent = await getAgent(id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

    const existing = await getCronJob(jobId);
    if (!existing || existing.agentId !== id) {
      res.status(404).json({ error: 'Cron job not found' });
      return;
    }

    const updates: Record<string, unknown> = {};
    const { name, schedule, message, enabled } = req.body;
    if (name !== undefined) updates.name = name;
    if (message !== undefined) updates.message = message;
    if (enabled !== undefined) updates.enabled = enabled;
    if (schedule !== undefined) {
      const validationError = validateSchedule(schedule);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }
      updates.schedule = schedule;
    }

    const updated = await updateCronJobStorage(jobId, updates);
    if (!updated) {
      res.status(404).json({ error: 'Cron job not found' });
      return;
    }

    // Reschedule if schedule, enabled, or relevant fields changed
    if (updated.enabled) {
      rescheduleJob(updated);
    } else {
      unscheduleJob(jobId);
    }

    res.json({ job: { ...updated, nextRunAt: updated.enabled ? getNextRunTime(updated) : undefined } });
  } catch (error) {
    console.error('Error updating cron job:', error);
    res.status(500).json({ error: 'Failed to update cron job' });
  }
});

// DELETE /api/agents/:id/cron/:jobId - Delete cron job
router.delete('/:id/cron/:jobId', async (req: Request, res: Response) => {
  try {
    const { id, jobId } = req.params;
    const agent = await getAgent(id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

    const job = await getCronJob(jobId);
    if (!job || job.agentId !== id) {
      res.status(404).json({ error: 'Cron job not found' });
      return;
    }

    unscheduleJob(jobId);
    await deleteCronJobStorage(jobId);

    res.json({ success: true, message: 'Cron job deleted' });
  } catch (error) {
    console.error('Error deleting cron job:', error);
    res.status(500).json({ error: 'Failed to delete cron job' });
  }
});

// POST /api/agents/:id/cron/:jobId/trigger - Fire job now
router.post('/:id/cron/:jobId/trigger', async (req: Request, res: Response) => {
  try {
    const { id, jobId } = req.params;
    const agent = await getAgent(id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

    const job = await getCronJob(jobId);
    if (!job || job.agentId !== id) {
      res.status(404).json({ error: 'Cron job not found' });
      return;
    }

    await executeJob(jobId);
    res.json({ success: true, message: 'Job triggered' });
  } catch (error) {
    console.error('Error triggering cron job:', error);
    res.status(500).json({ error: 'Failed to trigger cron job' });
  }
});

// GET /api/agents/:id/cron-history - Get cron run history
router.get('/:id/cron-history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getAgent(id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

    const history = await getCronHistory(id);
    res.json({ history });
  } catch (error) {
    console.error('Error getting cron history:', error);
    res.status(500).json({ error: 'Failed to get cron history' });
  }
});

export default router;
