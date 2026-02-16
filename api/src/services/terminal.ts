import Docker from 'dockerode';
import type { WebSocket } from 'ws';

const docker = new Docker();
const CONTAINER_PREFIX = 'nexus-agent-';

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

export async function handleTerminalConnection(ws: WebSocket, agentId: string): Promise<void> {
  const container = await getContainer(agentId);

  if (!container) {
    ws.send('\r\n\x1b[31mError: Container not found for this agent.\x1b[0m\r\n');
    ws.close();
    return;
  }

  // Check if container is running
  try {
    const info = await container.inspect();
    if (!info.State.Running) {
      ws.send('\r\n\x1b[33mContainer is not running. Start the agent first.\x1b[0m\r\n');
      ws.close();
      return;
    }
  } catch {
    ws.send('\r\n\x1b[31mError: Could not inspect container.\x1b[0m\r\n');
    ws.close();
    return;
  }

  try {
    // Create exec instance with interactive shell
    const exec = await container.exec({
      Cmd: ['/bin/bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });

    // Start the exec with a bidirectional stream
    const stream = await exec.start({
      hijack: true,
      stdin: true,
      Tty: true,
    });

    // Pipe container output to WebSocket
    stream.on('data', (chunk: Buffer) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(chunk);
      }
    });

    stream.on('end', () => {
      if (ws.readyState === ws.OPEN) {
        ws.send('\r\n\x1b[33mShell session ended.\x1b[0m\r\n');
        ws.close();
      }
    });

    // Pipe WebSocket input to container
    ws.on('message', (data: Buffer | string) => {
      try {
        const input = typeof data === 'string' ? data : data.toString();
        // Check for resize messages
        try {
          const parsed = JSON.parse(input);
          if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
            exec.resize({ w: parsed.cols, h: parsed.rows }).catch(() => {});
            return;
          }
        } catch {
          // Not JSON, treat as stdin input
        }
        stream.write(data);
      } catch {
        // Stream may be closed
      }
    });

    ws.on('close', () => {
      stream.end();
    });

    ws.on('error', () => {
      stream.end();
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ws.send(`\r\n\x1b[31mError starting shell: ${errMsg}\x1b[0m\r\n`);
    ws.close();
  }
}
