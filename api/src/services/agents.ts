import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { Agent, AgentConfig, AgentState, Message, MessageQueue, QueueStats, MessageStatus, HealthStatus } from '../types.js';

// Simple async mutex to prevent concurrent read-modify-write races
let stateLock: Promise<void> = Promise.resolve();

function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = stateLock;
  let resolve: () => void;
  stateLock = new Promise<void>(r => { resolve = r; });
  return release.then(fn).finally(() => resolve!());
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const QUEUES_DIR = path.join(DATA_DIR, 'queues');

// Base port for agent containers
const BASE_PORT = 3100;

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(QUEUES_DIR, { recursive: true });
}

async function loadAgentState(): Promise<AgentState> {
  await ensureDirectories();
  try {
    const data = await fs.readFile(AGENTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { agents: [] };
  }
}

async function saveAgentState(state: AgentState): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(AGENTS_FILE, JSON.stringify(state, null, 2));
}

export async function createAgent(config: AgentConfig): Promise<Agent> {
  return withStateLock(async () => {
    const state = await loadAgentState();

    // Calculate next available port
    const usedPorts = state.agents.map(a => a.port).filter(Boolean) as number[];
    let port = BASE_PORT + 1;
    while (usedPorts.includes(port)) {
      port++;
    }

    const agent: Agent = {
      id: uuidv4(),
      name: config.name,
      template: config.template,
      cellType: config.cellType || 'sdk',
      createdAt: new Date().toISOString(),
      port,
      status: 'created',
    };

    state.agents.push(agent);
    await saveAgentState(state);

    // Initialize empty message queue
    await saveQueue(agent.id, { agentId: agent.id, messages: [] });

    return agent;
  });
}

export async function getAgent(agentId: string): Promise<Agent | null> {
  const state = await loadAgentState();
  return state.agents.find(a => a.id === agentId) || null;
}

export async function listAgents(): Promise<Agent[]> {
  const state = await loadAgentState();
  return state.agents;
}

export async function updateAgent(agentId: string, updates: Partial<Agent>): Promise<Agent | null> {
  return withStateLock(async () => {
    const state = await loadAgentState();
    const index = state.agents.findIndex(a => a.id === agentId);

    if (index === -1) {
      return null;
    }

    state.agents[index] = { ...state.agents[index], ...updates };
    await saveAgentState(state);
    return state.agents[index];
  });
}

export async function updateAgentHealthStatus(
  agentId: string,
  healthStatus: HealthStatus,
  healthFailures: number = 0
): Promise<Agent | null> {
  return updateAgent(agentId, { healthStatus, healthFailures });
}

export async function deleteAgent(agentId: string): Promise<boolean> {
  return withStateLock(async () => {
    const state = await loadAgentState();
    const index = state.agents.findIndex(a => a.id === agentId);

    if (index === -1) {
      return false;
    }

    state.agents.splice(index, 1);
    await saveAgentState(state);

    // Clean up queue file
    try {
      await fs.unlink(getQueuePath(agentId));
    } catch {
      // Queue might not exist
    }

    return true;
  });
}

// Queue management
function getQueuePath(agentId: string): string {
  return path.join(QUEUES_DIR, `${agentId}.json`);
}

async function loadQueue(agentId: string): Promise<MessageQueue> {
  try {
    const data = await fs.readFile(getQueuePath(agentId), 'utf-8');
    return JSON.parse(data);
  } catch {
    return { agentId, messages: [] };
  }
}

async function saveQueue(agentId: string, queue: MessageQueue): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(getQueuePath(agentId), JSON.stringify(queue, null, 2));
}

export async function enqueueMessage(
  agentId: string,
  content: string,
  role: Message['role'] = 'user',
  metadata?: Record<string, unknown>,
  status: MessageStatus = 'pending'
): Promise<Message> {
  return withStateLock(async () => {
    const queue = await loadQueue(agentId);

    const message: Message = {
      id: uuidv4(),
      agentId,
      content,
      role,
      timestamp: new Date().toISOString(),
      metadata,
      status,
    };

    queue.messages.push(message);
    await saveQueue(agentId, queue);

    return message;
  });
}

export async function dequeueMessage(agentId: string): Promise<Message | null> {
  return withStateLock(async () => {
    const queue = await loadQueue(agentId);

    // Find first pending message
    const messageIndex = queue.messages.findIndex(m => m.status === 'pending');
    if (messageIndex === -1) {
      return null;
    }

    // Mark as processing
    queue.messages[messageIndex].status = 'processing';
    await saveQueue(agentId, queue);

    return queue.messages[messageIndex];
  });
}

export async function updateMessageStatus(
  agentId: string,
  messageId: string,
  status: MessageStatus
): Promise<Message | null> {
  return withStateLock(async () => {
    const queue = await loadQueue(agentId);
    const message = queue.messages.find(m => m.id === messageId);

    if (!message) {
      return null;
    }

    message.status = status;
    await saveQueue(agentId, queue);
    return message;
  });
}

export async function recoverStuckMessages(agentId: string): Promise<number> {
  return withStateLock(async () => {
    const queue = await loadQueue(agentId);
    let recovered = 0;

    for (const message of queue.messages) {
      if (message.status === 'processing') {
        message.status = 'pending';
        recovered++;
      }
    }

    if (recovered > 0) {
      await saveQueue(agentId, queue);
      console.log(`[Queue Recovery] Reset ${recovered} stuck messages for agent ${agentId}`);
    }

    return recovered;
  });
}

export async function recoverAllStuckMessages(): Promise<void> {
  const state = await loadAgentState();

  for (const agent of state.agents) {
    await recoverStuckMessages(agent.id);
  }
}

export async function getQueueStats(agentId: string): Promise<QueueStats> {
  const queue = await loadQueue(agentId);

  const stats: QueueStats = {
    agentId,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: queue.messages.length,
  };

  for (const message of queue.messages) {
    const status = message.status || 'pending';
    if (status in stats) {
      stats[status as keyof Pick<QueueStats, 'pending' | 'processing' | 'completed' | 'failed'>]++;
    }
  }

  return stats;
}

export async function getQueue(agentId: string): Promise<Message[]> {
  const queue = await loadQueue(agentId);
  return queue.messages;
}

export async function getNextPort(): Promise<number> {
  const state = await loadAgentState();
  const usedPorts = state.agents.map(a => a.port).filter(Boolean) as number[];
  let port = BASE_PORT + 1;
  while (usedPorts.includes(port)) {
    port++;
  }
  return port;
}

// Skills management is now handled by volume.ts
// Import directly from './volume.js' for skill operations
