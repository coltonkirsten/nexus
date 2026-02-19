import Docker from 'dockerode';
import { Readable } from 'stream';
import tar from 'tar-stream';
import type { ContainerConfig, AgentStatus } from '../types.js';

const docker = new Docker();

const CONTAINER_PREFIX = 'nexus-agent-';
const INTERNAL_PORT = 3100;

function isNotFoundError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { statusCode?: number }).statusCode === 404;
}

export async function createAgentContainer(config: ContainerConfig): Promise<string> {
  const containerName = `${CONTAINER_PREFIX}${config.agentId}`;

  // Build mounts from explicit volume names (only add mounts that are provided)
  const mounts: Docker.MountSettings[] = [];
  const labels: Record<string, string> = {
    'nexus.agent.id': config.agentId,
    'nexus.managed': 'true',
  };

  if (config.ledgerVolume) {
    mounts.push({
      Target: '/ledger',
      Source: config.ledgerVolume,
      Type: 'volume',
    });
    labels['nexus.volume.ledger'] = config.ledgerVolume;
  }

  if (config.workspaceVolume) {
    mounts.push({
      Target: '/workspace',
      Source: config.workspaceVolume,
      Type: 'volume',
    });
    labels['nexus.volume.workspace'] = config.workspaceVolume;
  }

  if (config.sharedVolume) {
    mounts.push({
      Target: '/shared',
      Source: config.sharedVolume,
      Type: 'volume',
    });
    labels['nexus.volume.shared'] = config.sharedVolume;
  }

  const container = await docker.createContainer({
    Image: 'nexus-cell:latest',
    name: containerName,
    Env: [
      `AGENT_ID=${config.agentId}`,
      ...(config.agentName ? [`AGENT_NAME=${config.agentName}`] : []),
      `ENGINE_PORT=${INTERNAL_PORT}`,
      `NEXUS_API_URL=http://host.docker.internal:${process.env.API_PORT || 3001}`,
      ...(config.apiKey ? [`ANTHROPIC_API_KEY=${config.apiKey}`] : []),
    ],
    ExposedPorts: {
      [`${INTERNAL_PORT}/tcp`]: {},
    },
    HostConfig: {
      PortBindings: {
        [`${INTERNAL_PORT}/tcp`]: [{ HostPort: String(config.port) }],
      },
      Mounts: mounts,
      ExtraHosts: ['host.docker.internal:host-gateway'],
      RestartPolicy: { Name: 'unless-stopped' },
    },
    Labels: labels,
  });

  return container.id;
}

export async function recreateContainer(config: ContainerConfig): Promise<string> {
  // Remove old container
  await removeContainer(config.agentId);
  // Create new with updated config
  try {
    return await createAgentContainer(config);
  } catch (err) {
    throw new Error(
      `Failed to create replacement container for agent ${config.agentId} after removing the old one: ${err instanceof Error ? err.message : err}`
    );
  }
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
  if (!container) return;

  // Stop — ignore 304 (already stopped) and 404 (not found)
  try {
    await container.stop();
  } catch (err: unknown) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code !== 304 && code !== 404) throw err;
  }

  // Remove — try normal first, then force, only ignore 404
  try {
    await container.remove();
  } catch (err: unknown) {
    if (isNotFoundError(err)) return;
    // Fallback: force remove
    try {
      await container.remove({ force: true } as Docker.ContainerRemoveOptions);
    } catch (forceErr: unknown) {
      if (!isNotFoundError(forceErr)) throw forceErr;
    }
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

export async function removeDockerVolume(dockerVolumeName: string): Promise<void> {
  try {
    const volume = docker.getVolume(dockerVolumeName);
    await volume.remove();
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }
}

export async function cloneDockerVolume(source: string, target: string): Promise<void> {
  // Create target volume
  await docker.createVolume({ Name: target });

  // Spin up a throwaway container to copy data
  const container = await docker.createContainer({
    Image: 'nexus-cell:latest',
    Cmd: ['sh', '-c', 'cp -a /source/. /target/'],
    HostConfig: {
      Mounts: [
        { Target: '/source', Source: source, Type: 'volume', ReadOnly: true },
        { Target: '/target', Source: target, Type: 'volume' },
      ],
    },
  });

  try {
    await container.start();
    await container.wait();
  } finally {
    try { await container.remove(); } catch { /* ignore */ }
  }
}

export async function readFromVolume(
  dockerVolumeName: string,
  filePath: string
): Promise<NodeJS.ReadableStream> {
  // Spin up a temp container to read from detached volume
  const container = await docker.createContainer({
    Image: 'nexus-cell:latest',
    Cmd: ['sleep', '30'],
    HostConfig: {
      Mounts: [
        { Target: '/vol', Source: dockerVolumeName, Type: 'volume', ReadOnly: true },
      ],
    },
  });

  try {
    await container.start();
    const archive = await container.getArchive({ path: `/vol${filePath}` });

    // Clean up container once stream is consumed (or errors/closes)
    let cleaned = false;
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      try { await container.stop(); } catch { /* best-effort */ }
      try { await container.remove(); } catch { /* best-effort */ }
    };

    const stream = archive as NodeJS.ReadableStream;
    stream.on('end', cleanup);
    stream.on('close', cleanup);
    stream.on('error', cleanup);
    // Safety-net timeout in case stream events don't fire
    setTimeout(cleanup, 30000);

    return stream;
  } catch (err) {
    try { await container.stop(); } catch { /* best-effort */ }
    try { await container.remove(); } catch { /* best-effort */ }
    throw err;
  }
}

export async function listFromVolume(
  dockerVolumeName: string,
  dirPath: string
): Promise<NodeJS.ReadableStream> {
  // Same as readFromVolume but for directories
  return readFromVolume(dockerVolumeName, dirPath);
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
    const execStream = await exec.start({});
    // Await completion by consuming the stream
    await new Promise<void>((resolve, reject) => {
      execStream.on('end', resolve);
      execStream.on('error', reject);
      execStream.resume(); // drain the stream
    });
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

export async function seedVolume(
  dockerVolumeName: string,
  files: Array<{ path: string; content: string }>
): Promise<void> {
  // Create a tar archive with the files and write to the volume via temp container
  const container = await docker.createContainer({
    Image: 'nexus-cell:latest',
    Cmd: ['sleep', '30'],
    HostConfig: {
      Mounts: [
        { Target: '/vol', Source: dockerVolumeName, Type: 'volume' },
      ],
    },
  });

  try {
    await container.start();

    // Build a tar stream with the files
    const pack = tar.pack();
    for (const file of files) {
      pack.entry({ name: file.path }, file.content);
    }
    pack.finalize();

    await container.putArchive(pack as unknown as NodeJS.ReadableStream, { path: '/vol' });

    // Fix ownership — run attached and await completion
    const exec = await container.exec({
      Cmd: ['chown', '-R', 'agent:agent', '/vol'],
      User: 'root',
    });
    const execStream = await exec.start({});
    await new Promise<void>((resolve, reject) => {
      execStream.on('end', resolve);
      execStream.on('error', reject);
      execStream.resume(); // drain the stream
    });
  } finally {
    try { await container.stop(); } catch { /* ignore */ }
    try { await container.remove(); } catch { /* ignore */ }
  }
}

export { docker };
