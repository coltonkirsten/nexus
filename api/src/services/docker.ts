import Docker from 'dockerode';
import type { ContainerConfig, AgentStatus } from '../types.js';

const docker = new Docker();

const CONTAINER_PREFIX = 'nexus-agent-';
const INTERNAL_PORT = 3100;

function getLedgerVolumeName(agentId: string): string {
  return `nexus-ledger-${agentId}`;
}

function getWorkspaceVolumeName(agentId: string): string {
  return `nexus-workspace-${agentId}`;
}

export async function createAgentContainer(config: ContainerConfig): Promise<string> {
  const containerName = `${CONTAINER_PREFIX}${config.agentId}`;
  const ledgerVolume = getLedgerVolumeName(config.agentId);
  const workspaceVolume = getWorkspaceVolumeName(config.agentId);

  const container = await docker.createContainer({
    Image: 'nexus-cell:latest',
    name: containerName,
    Env: [
      `AGENT_ID=${config.agentId}`,
      `ENGINE_PORT=${INTERNAL_PORT}`,
      ...(config.apiKey ? [`ANTHROPIC_API_KEY=${config.apiKey}`] : []),
    ],
    ExposedPorts: {
      [`${INTERNAL_PORT}/tcp`]: {},
    },
    HostConfig: {
      PortBindings: {
        [`${INTERNAL_PORT}/tcp`]: [{ HostPort: String(config.port) }],
      },
      Mounts: [
        {
          Target: '/ledger',
          Source: ledgerVolume,
          Type: 'volume',
        },
        {
          Target: '/workspace',
          Source: workspaceVolume,
          Type: 'volume',
        },
      ],
      RestartPolicy: { Name: 'unless-stopped' },
    },
    Labels: {
      'nexus.agent.id': config.agentId,
      'nexus.managed': 'true',
      'nexus.volume.ledger': ledgerVolume,
      'nexus.volume.workspace': workspaceVolume,
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

export async function getContainer(agentId: string): Promise<Docker.Container | null> {
  const containerName = `${CONTAINER_PREFIX}${agentId}`;

  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [containerName] },
    });
    // Docker name filter is substring match, so verify exact match
    const exact = containers.find(c =>
      c.Names.some(n => n === `/${containerName}`)
    );
    if (exact) {
      return docker.getContainer(exact.Id);
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

export async function removeAgentVolumes(agentId: string): Promise<void> {
  const volumeNames = [
    getLedgerVolumeName(agentId),
    getWorkspaceVolumeName(agentId),
  ];
  for (const name of volumeNames) {
    try {
      const volume = docker.getVolume(name);
      await volume.remove();
    } catch {
      // Volume might not exist
    }
  }
}

export async function copyToContainer(
  agentId: string,
  tarStream: NodeJS.ReadableStream,
  containerPath: string
): Promise<void> {
  const container = await getContainer(agentId);
  if (!container) throw new Error(`Container for agent ${agentId} not found`);
  await container.putArchive(tarStream, { path: containerPath });

  // Fix ownership so agent user can access uploaded files
  if (containerPath.startsWith('/workspace') || containerPath.startsWith('/ledger')) {
    const exec = await container.exec({
      Cmd: ['chown', '-R', 'agent:agent', containerPath],
      User: 'root',
    });
    await exec.start({ Detach: true });
  }
}

export async function copyFromContainer(
  agentId: string,
  containerPath: string
): Promise<NodeJS.ReadableStream> {
  const container = await getContainer(agentId);
  if (!container) throw new Error(`Container for agent ${agentId} not found`);
  return container.getArchive({ path: containerPath }) as Promise<NodeJS.ReadableStream>;
}
