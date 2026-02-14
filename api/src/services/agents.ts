import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { Agent, AgentConfig, AgentState, Message, MessageQueue, QueueStats, MessageStatus, HealthStatus } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const QUEUES_DIR = path.join(DATA_DIR, 'queues');
const AGENTS_DIR = path.resolve(__dirname, '../../agents');
const TEMPLATES_DIR = path.resolve(__dirname, '../../../templates');

// Base port for agent containers
const BASE_PORT = 3100;

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(QUEUES_DIR, { recursive: true });
  await fs.mkdir(AGENTS_DIR, { recursive: true });
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
    createdAt: new Date().toISOString(),
    port,
    status: 'created',
    mode: config.mode || 'task',
    sessionPersistence: config.sessionPersistence ?? false,
  };

  // Create agent directories
  const agentDir = path.join(AGENTS_DIR, agent.id);
  const ledgerDir = path.join(agentDir, 'ledger');
  const memoryDir = path.join(ledgerDir, 'memory');
  const skillsDir = path.join(ledgerDir, 'skills');

  await fs.mkdir(ledgerDir, { recursive: true });
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.mkdir(skillsDir, { recursive: true });
  await fs.mkdir(path.join(agentDir, 'workspace'), { recursive: true });

  // Seed ledger files from template
  const templateName = config.template || 'blank';
  const templateDir = path.join(TEMPLATES_DIR, templateName);

  try {
    // Copy identity.md from template
    const identitySrc = path.join(templateDir, 'identity.md');
    const identityDest = path.join(ledgerDir, 'identity.md');
    const identityContent = await fs.readFile(identitySrc, 'utf-8');
    await fs.writeFile(identityDest, identityContent, 'utf-8');

    // Create empty memory/index.md
    await fs.writeFile(
      path.join(memoryDir, 'index.md'),
      '# Memory Index\n\nThis file is updated by the agent as it learns important facts.\n\n## Facts\n\n<!-- Agent will add facts here -->\n',
      'utf-8'
    );

    // Copy skills from template if they exist
    const templateSkillsDir = path.join(templateDir, 'skills');
    try {
      const skillFiles = await fs.readdir(templateSkillsDir);
      for (const file of skillFiles) {
        if (file.endsWith('.md')) {
          const skillContent = await fs.readFile(path.join(templateSkillsDir, file), 'utf-8');
          await fs.writeFile(path.join(skillsDir, file), skillContent, 'utf-8');
        }
      }
    } catch {
      // No skills in template, that's fine
    }
  } catch (err) {
    console.error(`Failed to seed ledger from template ${templateName}:`, err);
    // Fall back to default identity
    await fs.writeFile(
      path.join(ledgerDir, 'identity.md'),
      '# Identity\n\nYou are an autonomous AI agent. Work on tasks using your tools. Update /ledger/memory/index.md with important facts.\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(memoryDir, 'index.md'),
      '# Memory Index\n\n<!-- Agent will add facts here -->\n',
      'utf-8'
    );
  }

  state.agents.push(agent);
  await saveAgentState(state);

  // Initialize empty message queue
  await saveQueue(agent.id, { agentId: agent.id, messages: [] });

  return agent;
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
  const state = await loadAgentState();
  const index = state.agents.findIndex(a => a.id === agentId);

  if (index === -1) {
    return null;
  }

  state.agents[index] = { ...state.agents[index], ...updates };
  await saveAgentState(state);
  return state.agents[index];
}

export async function updateAgentHealthStatus(
  agentId: string,
  healthStatus: HealthStatus,
  healthFailures: number = 0
): Promise<Agent | null> {
  return updateAgent(agentId, { healthStatus, healthFailures });
}

export async function deleteAgent(agentId: string): Promise<boolean> {
  const state = await loadAgentState();
  const index = state.agents.findIndex(a => a.id === agentId);

  if (index === -1) {
    return false;
  }

  state.agents.splice(index, 1);
  await saveAgentState(state);

  // Clean up agent directories
  try {
    const agentDir = path.join(AGENTS_DIR, agentId);
    await fs.rm(agentDir, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }

  // Clean up queue file
  try {
    await fs.unlink(getQueuePath(agentId));
  } catch {
    // Queue might not exist
  }

  return true;
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
}

export async function dequeueMessage(agentId: string): Promise<Message | null> {
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
}

export async function updateMessageStatus(
  agentId: string,
  messageId: string,
  status: MessageStatus
): Promise<Message | null> {
  const queue = await loadQueue(agentId);
  const message = queue.messages.find(m => m.id === messageId);

  if (!message) {
    return null;
  }

  message.status = status;
  await saveQueue(agentId, queue);
  return message;
}

export async function recoverStuckMessages(agentId: string): Promise<number> {
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

// Skills management
export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
  content?: string;
}

function getSkillsDir(agentId: string): string {
  return path.join(AGENTS_DIR, agentId, 'ledger', 'skills');
}

export async function listSkills(agentId: string): Promise<SkillMetadata[]> {
  const skillsDir = getSkillsDir(agentId);

  try {
    await fs.mkdir(skillsDir, { recursive: true });
    const files = await fs.readdir(skillsDir);
    const skills: SkillMetadata[] = [];

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(skillsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const name = file.replace('.md', '');

        // Extract description from first line if it starts with #
        let description = '';
        const lines = content.split('\n');
        if (lines[0]?.startsWith('# ')) {
          description = lines[0].substring(2).trim();
        } else if (lines[0]) {
          description = lines[0].trim();
        }

        skills.push({
          name,
          description,
          path: `/ledger/skills/${file}`,
        });
      }
    }

    return skills;
  } catch {
    return [];
  }
}

export async function getSkill(agentId: string, skillName: string): Promise<SkillMetadata | null> {
  const skillsDir = getSkillsDir(agentId);
  const filePath = path.join(skillsDir, `${skillName}.md`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    let description = '';
    if (lines[0]?.startsWith('# ')) {
      description = lines[0].substring(2).trim();
    } else if (lines[0]) {
      description = lines[0].trim();
    }

    return {
      name: skillName,
      description,
      path: `/ledger/skills/${skillName}.md`,
      content,
    };
  } catch {
    return null;
  }
}

export async function createSkill(
  agentId: string,
  name: string,
  description: string,
  content?: string
): Promise<SkillMetadata> {
  const skillsDir = getSkillsDir(agentId);
  await fs.mkdir(skillsDir, { recursive: true });

  // Sanitize skill name for filename
  const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  const filePath = path.join(skillsDir, `${sanitizedName}.md`);

  // Create default content if not provided
  const skillContent = content || `# ${description}\n\n## Description\n\n${description}\n\n## Instructions\n\n<!-- Add skill instructions here -->\n`;

  await fs.writeFile(filePath, skillContent, 'utf-8');

  return {
    name: sanitizedName,
    description,
    path: `/ledger/skills/${sanitizedName}.md`,
    content: skillContent,
  };
}

export async function updateSkill(
  agentId: string,
  skillName: string,
  content: string
): Promise<SkillMetadata | null> {
  const skillsDir = getSkillsDir(agentId);
  const filePath = path.join(skillsDir, `${skillName}.md`);

  try {
    // Check if skill exists
    await fs.access(filePath);

    await fs.writeFile(filePath, content, 'utf-8');

    const lines = content.split('\n');
    let description = '';
    if (lines[0]?.startsWith('# ')) {
      description = lines[0].substring(2).trim();
    } else if (lines[0]) {
      description = lines[0].trim();
    }

    return {
      name: skillName,
      description,
      path: `/ledger/skills/${skillName}.md`,
      content,
    };
  } catch {
    return null;
  }
}

export async function deleteSkill(agentId: string, skillName: string): Promise<boolean> {
  const skillsDir = getSkillsDir(agentId);
  const filePath = path.join(skillsDir, `${skillName}.md`);

  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
