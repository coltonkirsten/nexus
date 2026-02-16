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
  startContainer,
  stopContainer,
  removeContainer,
  removeAgentVolumes,
  getContainerStatus,
  getContainerLogs,
} from '../services/docker.js';
import { sendMessage, getHealth, streamLogs, getSession, clearSession } from '../services/engine.js';
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
import type { AgentConfig, AgentMode, MessageStatus } from '../types.js';

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

// POST /api/agents - Create agent
router.post('/', async (req: Request, res: Response) => {
  try {
    const config: AgentConfig = req.body;

    if (!config.name) {
      res.status(400).json({ error: 'Agent name is required' });
      return;
    }

    const agent = await createAgent(config);

    // Create Docker container (this also creates named volumes)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const containerId = await createAgentContainer({
      agentId: agent.id,
      port: agent.port!,
      apiKey,
    });

    // Template seeding happens at start time via engine /init endpoint
    await updateAgent(agent.id, { containerId });

    res.status(201).json({ agent: { ...agent, containerId } });
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
    const agent = await getAgent(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Remove container first
    try {
      await removeContainer(id);
    } catch {
      // Container might not exist
    }

    // Clean up Docker volumes
    try {
      await removeAgentVolumes(id);
    } catch {
      // Volumes might not exist
    }

    // Delete agent data
    const deleted = await deleteAgent(id);

    if (deleted) {
      res.json({ success: true, message: 'Agent deleted' });
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
    await startContainer(id);

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

    await updateAgent(id, { status: 'stopping' });
    await stopContainer(id);
    await updateAgent(id, { status: 'stopped' });

    res.json({ success: true, message: 'Agent stopped' });
  } catch (error) {
    console.error('Error stopping agent:', error);
    res.status(500).json({ error: 'Failed to stop agent' });
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
      mode: agent.mode,
      sessionPersistence: agent.sessionPersistence,
    });
  } catch (error) {
    console.error('Error getting agent status:', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

// POST /api/agents/:id/mode - Switch agent mode (task/conversation)
router.post('/:id/mode', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { mode } = req.body as { mode?: AgentMode };

    if (!mode || (mode !== 'task' && mode !== 'conversation')) {
      res.status(400).json({ error: 'Invalid mode. Must be "task" or "conversation".' });
      return;
    }

    const agent = await getAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const updated = await updateAgent(id, { mode });
    res.json({
      success: true,
      agent: updated,
      message: `Agent mode switched to "${mode}"`,
    });
  } catch (error) {
    console.error('Error switching agent mode:', error);
    res.status(500).json({ error: 'Failed to switch agent mode' });
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
      sessionPersistence: agent.sessionPersistence,
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

    // Check rate limit
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

    // Handle based on agent mode
    if (agent.mode === 'conversation') {
      // Conversation mode: send directly, wait for response
      if (agent.status !== 'running') {
        res.status(400).json({ error: 'Agent is not running. Start the agent to use conversation mode.' });
        return;
      }

      const engineResponse = await sendMessage(id, message, {
        sessionPersistence: agent.sessionPersistence,
        waitForResponse: true,
        config: agent.config,
      });

      if (!engineResponse.success) {
        res.status(500).json({ error: engineResponse.error || 'Failed to get response from agent' });
        return;
      }

      // Enqueue both user message and agent response for history
      const userMessage = await enqueueMessage(id, message, role, metadata);
      if (engineResponse.response) {
        await enqueueMessage(id, engineResponse.response, 'agent', { conversationMode: true });
      }

      res.json({
        message: userMessage,
        response: engineResponse.response,
        mode: 'conversation',
      });
    } else {
      // Task mode (default): queue message, optionally send to engine
      const enqueuedMessage = await enqueueMessage(id, message, role, metadata);

      // Try to send to engine if running
      let engineResponse = null;
      if (agent.status === 'running') {
        engineResponse = await sendMessage(id, message, {
          sessionPersistence: agent.sessionPersistence,
          config: agent.config,
        });
      }

      res.json({
        message: enqueuedMessage,
        engineResponse,
        mode: 'task',
      });
    }
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
    const content = await readVolumeFile(id, fullPath);
    if (content === null) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.json({ content });
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
    const content = await readVolumeFile(id, fullPath);
    if (content === null) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.json({ content });
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
              const data = log.data as { type?: string; message?: { content?: Array<{ text?: string }> }; duration_ms?: number; usage?: { input_tokens?: number; output_tokens?: number }; total_cost_usd?: number; result?: string };
              if (data.type === 'assistant' && data.message?.content?.[0]) {
                const content = data.message.content[0];
                if ('text' in content) {
                  currentInvocation.result = content.text || '';
                }
              }
              if (data.type === 'result') {
                currentInvocation.durationMs = data.duration_ms || 0;
                currentInvocation.tokenUsage = {
                  input: data.usage?.input_tokens || 0,
                  output: data.usage?.output_tokens || 0
                };
                currentInvocation.costUsd = data.total_cost_usd || 0;
                currentInvocation.result = data.result || currentInvocation.result;
              }
            }
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

export default router;
