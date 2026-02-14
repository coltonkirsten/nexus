import Docker from 'dockerode';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ContainerConfig, AgentStatus } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const docker = new Docker();

const CONTAINER_PREFIX = 'nexus-agent-';
const INTERNAL_PORT = 3100;

export async function createAgentContainer(config: ContainerConfig): Promise<string> {
  const containerName = `${CONTAINER_PREFIX}${config.agentId}`;
  const agentDir = path.join(PROJECT_ROOT, 'api', 'agents', config.agentId);

  const container = await docker.createContainer({
    Image: 'nexus-cell:latest',
    name: containerName,
    Env: [
      `AGENT_ID=${config.agentId}`,
      `PORT=${INTERNAL_PORT}`,
      ...(config.apiKey ? [`ANTHROPIC_API_KEY=${config.apiKey}`] : []),
    ],
    ExposedPorts: {
      [`${INTERNAL_PORT}/tcp`]: {},
    },
    HostConfig: {
      PortBindings: {
        [`${INTERNAL_PORT}/tcp`]: [{ HostPort: String(config.port) }],
      },
      Binds: [
        `${path.join(agentDir, 'ledger')}:/ledger`,
        `${path.join(agentDir, 'workspace')}:/workspace`,
      ],
      RestartPolicy: { Name: 'unless-stopped' },
    },
    Labels: {
      'nexus.agent.id': config.agentId,
      'nexus.managed': 'true',
    },
  });

  return container.id;
}

export async function startContainer(agentId: string): Promise<void> {
  const container = await getContainer(agentId);
  if (container) {
    await container.start();
  } else {
    throw new Error(`Container for agent ${agentId} not found`);
  }
}

export async function stopContainer(agentId: string): Promise<void> {
  const container = await getContainer(agentId);
  if (container) {
    await container.stop();
  } else {
    throw new Error(`Container for agent ${agentId} not found`);
  }
}

export async function removeContainer(agentId: string): Promise<void> {
  const container = await getContainer(agentId);
  if (container) {
    try {
      await container.stop();
    } catch {
      // Container might already be stopped
    }
    await container.remove();
  }
}

export async function getContainerStatus(agentId: string): Promise<AgentStatus> {
  const container = await getContainer(agentId);
  if (!container) {
    return 'created';
  }

  const info = await container.inspect();
  const state = info.State;

  if (state.Running) {
    return 'running';
  } else if (state.Paused) {
    return 'stopped';
  } else if (state.Restarting) {
    return 'starting';
  } else if (state.Dead || state.OOMKilled) {
    return 'error';
  } else {
    return 'stopped';
  }
}

export async function getContainerLogs(agentId: string): Promise<NodeJS.ReadableStream> {
  const container = await getContainer(agentId);
  if (!container) {
    throw new Error(`Container for agent ${agentId} not found`);
  }

  const logStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 100,
    timestamps: true,
  });

  return logStream as NodeJS.ReadableStream;
}

async function getContainer(agentId: string): Promise<Docker.Container | null> {
  const containerName = `${CONTAINER_PREFIX}${agentId}`;

  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [containerName] },
    });

    if (containers.length > 0) {
      return docker.getContainer(containers[0].Id);
    }
    return null;
  } catch {
    return null;
  }
}

export async function listNexusContainers(): Promise<Docker.ContainerInfo[]> {
  return docker.listContainers({
    all: true,
    filters: { label: ['nexus.managed=true'] },
  });
}
