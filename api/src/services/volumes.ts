import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { Volume, VolumeState, VolumeType } from '../types.js';
import {
  cloneDockerVolume,
  removeDockerVolume,
  seedVolume,
  docker,
} from './docker.js';

// Simple async mutex (same pattern as agents.ts)
let volumeLock: Promise<void> = Promise.resolve();

function withVolumeLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = volumeLock;
  let resolve: () => void;
  volumeLock = new Promise<void>(r => { resolve = r; });
  return release.then(fn).finally(() => resolve!());
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const VOLUMES_FILE = path.join(DATA_DIR, 'volumes.json');

const TEMPLATES_DIR = path.resolve(__dirname, '../../../templates');

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadVolumeState(): Promise<VolumeState> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(VOLUMES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { volumes: [] };
  }
}

async function saveVolumeState(state: VolumeState): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(VOLUMES_FILE, JSON.stringify(state, null, 2));
}

export async function createVolume(
  name: string,
  type: VolumeType,
  opts?: { template?: string; description?: string }
): Promise<Volume> {
  return withVolumeLock(async () => {
    const state = await loadVolumeState();
    const id = uuidv4();
    const dockerVolume = `nexus-vol-${id}`;

    // Create the Docker volume
    await docker.createVolume({ Name: dockerVolume });

    const volume: Volume = {
      id,
      name,
      type,
      dockerVolume,
      createdAt: new Date().toISOString(),
      template: opts?.template,
      description: opts?.description,
    };

    state.volumes.push(volume);
    await saveVolumeState(state);

    return volume;
  });
}

export async function getVolume(id: string): Promise<Volume | null> {
  const state = await loadVolumeState();
  return state.volumes.find(v => v.id === id) || null;
}

export async function listVolumes(type?: VolumeType): Promise<Volume[]> {
  const state = await loadVolumeState();
  if (type) {
    return state.volumes.filter(v => v.type === type);
  }
  return state.volumes;
}

export async function updateVolume(
  id: string,
  updates: Partial<Pick<Volume, 'name' | 'description'>>
): Promise<Volume | null> {
  return withVolumeLock(async () => {
    const state = await loadVolumeState();
    const index = state.volumes.findIndex(v => v.id === id);
    if (index === -1) return null;

    if (updates.name !== undefined) state.volumes[index].name = updates.name;
    if (updates.description !== undefined) state.volumes[index].description = updates.description;

    await saveVolumeState(state);
    return state.volumes[index];
  });
}

export async function deleteVolume(id: string): Promise<boolean> {
  return withVolumeLock(async () => {
    const state = await loadVolumeState();
    const index = state.volumes.findIndex(v => v.id === id);
    if (index === -1) return false;

    const volume = state.volumes[index];
    if (volume.attachedTo) {
      throw new Error('Cannot delete a volume that is attached to an agent. Detach it first.');
    }

    // Remove Docker volume
    await removeDockerVolume(volume.dockerVolume);

    state.volumes.splice(index, 1);
    await saveVolumeState(state);
    return true;
  });
}

export async function cloneVolume(sourceId: string, newName: string, description?: string): Promise<Volume> {
  return withVolumeLock(async () => {
    const state = await loadVolumeState();
    const source = state.volumes.find(v => v.id === sourceId);
    if (!source) throw new Error('Source volume not found');

    const id = uuidv4();
    const dockerVolume = `nexus-vol-${id}`;

    // Deep copy via Docker
    await cloneDockerVolume(source.dockerVolume, dockerVolume);

    const volume: Volume = {
      id,
      name: newName,
      type: source.type,
      dockerVolume,
      createdAt: new Date().toISOString(),
      description,
      clonedFrom: source.id,
    };

    state.volumes.push(volume);
    await saveVolumeState(state);
    return volume;
  });
}

export async function attachVolume(volumeId: string, agentId: string): Promise<Volume> {
  return withVolumeLock(async () => {
    const state = await loadVolumeState();
    const volume = state.volumes.find(v => v.id === volumeId);
    if (!volume) throw new Error('Volume not found');
    if (volume.attachedTo && volume.attachedTo !== agentId) {
      throw new Error(`Volume is already attached to agent ${volume.attachedTo}`);
    }

    volume.attachedTo = agentId;
    await saveVolumeState(state);
    return volume;
  });
}

export async function detachVolume(volumeId: string): Promise<Volume> {
  return withVolumeLock(async () => {
    const state = await loadVolumeState();
    const volume = state.volumes.find(v => v.id === volumeId);
    if (!volume) throw new Error('Volume not found');

    volume.attachedTo = undefined;
    await saveVolumeState(state);
    return volume;
  });
}

export async function seedVolumeFromTemplate(volumeId: string, templateName: string): Promise<void> {
  const volume = await getVolume(volumeId);
  if (!volume) throw new Error('Volume not found');
  if (volume.attachedTo) throw new Error('Cannot seed an attached volume');

  const templateDir = path.join(TEMPLATES_DIR, templateName);

  if (volume.type === 'ledger') {
    // Read identity from template
    let identity: string;
    try {
      identity = await fs.readFile(path.join(templateDir, 'identity.md'), 'utf-8');
    } catch {
      identity = '# Identity\n\nYou are an autonomous AI agent. Work on tasks using your tools. Update /ledger/memory/index.md with important facts.\n';
    }

    const memory = '# Memory Index\n\nThis file is updated by the agent as it learns important facts.\n\n## Facts\n\n<!-- Agent will add facts here -->\n';

    const files: Array<{ path: string; content: string }> = [
      { path: 'identity.md', content: identity },
      { path: 'memory/index.md', content: memory },
    ];

    // Read template skills
    const skillsDir = path.join(templateDir, 'skills');
    try {
      const entries = await fs.readdir(skillsDir);
      for (const entry of entries) {
        const entryPath = path.join(skillsDir, entry);
        const stat = await fs.stat(entryPath);
        if (stat.isDirectory()) {
          try {
            const content = await fs.readFile(path.join(entryPath, 'SKILL.md'), 'utf-8');
            files.push({ path: `skills/${entry}/SKILL.md`, content });
          } catch {
            // Skip skills without SKILL.md
          }
        }
      }
    } catch {
      // No skills directory
    }

    await seedVolume(volume.dockerVolume, files);
  }
  // workspace type — no default template seeding for now
}

/** Find volumes attached to a specific agent */
export async function getAgentVolumes(agentId: string): Promise<{ ledger?: Volume; workspace?: Volume }> {
  const state = await loadVolumeState();
  const ledger = state.volumes.find(v => v.attachedTo === agentId && v.type === 'ledger');
  const workspace = state.volumes.find(v => v.attachedTo === agentId && v.type === 'workspace');
  return { ledger, workspace };
}
