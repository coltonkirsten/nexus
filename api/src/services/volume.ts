import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { getAgent } from './agents.js';
import { getContainerStatus, copyFromContainer } from './docker.js';
import tar from 'tar-stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../../templates');

const CONTAINER_TIMEOUT = 10000;

// --- Engine HTTP proxy (used when container is running) ---

async function engineFetch(agentId: string, path: string, options?: RequestInit): Promise<Response> {
  const agent = await getAgent(agentId);
  if (!agent || !agent.port) {
    throw new Error(`Agent ${agentId} not found or has no port`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONTAINER_TIMEOUT);

  try {
    const response = await fetch(`http://localhost:${agent.port}${path}`, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Docker cp helpers (used when container is stopped) ---

async function readFileViaTar(agentId: string, containerPath: string): Promise<string | null> {
  try {
    const archiveStream = await copyFromContainer(agentId, containerPath);
    return await new Promise<string | null>((resolve, reject) => {
      const extract = tar.extract();
      let content = '';
      let found = false;

      extract.on('entry', (header, stream, next) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          if (!header.name.endsWith('/')) {
            content = Buffer.concat(chunks).toString('utf-8');
            found = true;
          }
          next();
        });
        stream.resume();
      });

      extract.on('finish', () => resolve(found ? content : null));
      extract.on('error', reject);

      if (archiveStream instanceof Readable) {
        archiveStream.pipe(extract);
      } else {
        (archiveStream as NodeJS.ReadableStream).pipe(extract);
      }
    });
  } catch {
    return null;
  }
}

interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: DirectoryEntry[];
}

async function listDirectoryViaTar(agentId: string, containerPath: string): Promise<DirectoryEntry[]> {
  try {
    const archiveStream = await copyFromContainer(agentId, containerPath);
    return await new Promise<DirectoryEntry[]>((resolve, reject) => {
      const extract = tar.extract();
      const entries: DirectoryEntry[] = [];

      extract.on('entry', (header, stream, next) => {
        const entryPath = header.name;
        if (entryPath && entryPath !== './') {
          const name = path.basename(entryPath.replace(/\/$/, ''));
          const isDir = header.type === 'directory';
          entries.push({
            name,
            type: isDir ? 'directory' : 'file',
            path: path.join(containerPath, entryPath.replace(/\/$/, '')),
            size: isDir ? undefined : header.size,
          });
        }
        stream.resume();
        next();
      });

      extract.on('finish', () => resolve(entries));
      extract.on('error', reject);

      if (archiveStream instanceof Readable) {
        archiveStream.pipe(extract);
      } else {
        (archiveStream as NodeJS.ReadableStream).pipe(extract);
      }
    });
  } catch {
    return [];
  }
}

// --- Public API: hybrid engine/docker-cp ---

async function isRunning(agentId: string): Promise<boolean> {
  const status = await getContainerStatus(agentId);
  return status === 'running';
}

export async function readFile_(agentId: string, containerPath: string): Promise<string | null> {
  if (await isRunning(agentId)) {
    try {
      const response = await engineFetch(agentId, `/files/read?path=${encodeURIComponent(containerPath)}`);
      if (response.ok) {
        const data = await response.json() as { content: string };
        return data.content;
      }
      return null;
    } catch {
      return null;
    }
  }

  return readFileViaTar(agentId, containerPath);
}

export async function writeFile_(agentId: string, containerPath: string, content: string): Promise<void> {
  if (!(await isRunning(agentId))) {
    throw new Error('Cannot write files while container is stopped');
  }

  const response = await engineFetch(agentId, '/files/write', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: containerPath, content }),
  });
  if (!response.ok) {
    throw new Error(`Failed to write file: ${response.status}`);
  }
}

export async function deleteFile_(agentId: string, containerPath: string): Promise<boolean> {
  if (await isRunning(agentId)) {
    try {
      const response = await engineFetch(agentId, `/files/delete?path=${encodeURIComponent(containerPath)}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // docker cp doesn't support deletion on stopped containers — would need to start the container
  // For now, return false if stopped
  return false;
}

export async function listDirectory(agentId: string, containerPath: string): Promise<DirectoryEntry[]> {
  if (await isRunning(agentId)) {
    try {
      const response = await engineFetch(agentId, `/files/list?path=${encodeURIComponent(containerPath)}`);
      if (response.ok) {
        const data = await response.json() as { entries: DirectoryEntry[] };
        return data.entries;
      }
      return [];
    } catch {
      return [];
    }
  }

  return listDirectoryViaTar(agentId, containerPath);
}

// --- Skills API (proxied through engine or docker cp) ---

export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
  content?: string;
}

export async function listSkills(agentId: string): Promise<SkillMetadata[]> {
  if (await isRunning(agentId)) {
    try {
      const response = await engineFetch(agentId, '/skills');
      if (response.ok) {
        const data = await response.json() as { skills: SkillMetadata[] };
        return data.skills;
      }
    } catch {
      // Fall through
    }
  }

  // Fallback: list via tar (limited — can only get directory names, not parse frontmatter)
  const entries = await listDirectoryViaTar(agentId, '/ledger/skills');
  return entries
    .filter((e) => e.type === 'directory')
    .map((e) => ({
      name: e.name,
      description: '',
      path: e.path,
    }));
}

export async function getSkill(agentId: string, skillName: string): Promise<SkillMetadata | null> {
  if (await isRunning(agentId)) {
    try {
      const response = await engineFetch(agentId, `/skills/${encodeURIComponent(skillName)}`);
      if (response.ok) {
        return (await response.json()) as SkillMetadata;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Fallback: read SKILL.md from the skill directory
  const content = await readFileViaTar(agentId, `/ledger/skills/${skillName}/SKILL.md`);
  if (!content) return null;

  return {
    name: skillName,
    description: '',
    path: `/ledger/skills/${skillName}`,
    content,
  };
}

export async function createSkill(
  agentId: string,
  name: string,
  description: string,
  content?: string
): Promise<SkillMetadata> {
  const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  const skillContent = content || `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${description}\n\n## Instructions\n\n<!-- Add skill instructions here -->\n`;

  if (!(await isRunning(agentId))) {
    throw new Error('Cannot create skills while container is stopped');
  }

  const response = await engineFetch(agentId, `/skills/${encodeURIComponent(sanitizedName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: skillContent }),
  });
  if (response.ok) {
    return (await response.json()) as SkillMetadata;
  }
  throw new Error(`Failed to create skill: ${response.status}`);
}

export async function updateSkill(
  agentId: string,
  skillName: string,
  content: string
): Promise<SkillMetadata | null> {
  if (!(await isRunning(agentId))) {
    throw new Error('Cannot update skills while container is stopped');
  }

  try {
    const response = await engineFetch(agentId, `/skills/${encodeURIComponent(skillName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (response.ok) {
      return (await response.json()) as SkillMetadata;
    }
    return null;
  } catch {
    return null;
  }
}

export async function deleteSkill(agentId: string, skillName: string): Promise<boolean> {
  if (await isRunning(agentId)) {
    try {
      const response = await engineFetch(agentId, `/skills/${encodeURIComponent(skillName)}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Cannot delete via docker cp on stopped containers
  return false;
}

// --- Template initialization (via engine HTTP, called after container is running) ---

const DEFAULT_IDENTITY = '# Identity\n\nYou are an autonomous AI agent. Work on tasks using your tools. Update /ledger/memory/index.md with important facts.\n';
const DEFAULT_MEMORY = '# Memory Index\n\nThis file is updated by the agent as it learns important facts.\n\n## Facts\n\n<!-- Agent will add facts here -->\n';

async function readTemplateSkills(templateDir: string): Promise<Array<{ name: string; content: string }>> {
  const skills: Array<{ name: string; content: string }> = [];
  const skillsDir = path.join(templateDir, 'skills');

  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    const entryPath = path.join(skillsDir, entry);
    const entryStat = await fs.stat(entryPath);
    if (entryStat.isDirectory()) {
      const skillFile = path.join(entryPath, 'SKILL.md');
      try {
        const content = await fs.readFile(skillFile, 'utf-8');
        skills.push({ name: entry, content });
      } catch {
        // Skip skills without SKILL.md
      }
    }
  }

  return skills;
}

export async function initializeAgent(
  agentId: string,
  templateName: string
): Promise<{ initialized: boolean; reason?: string }> {
  const templateDir = path.join(TEMPLATES_DIR, templateName);

  // Read identity from template
  let identity: string;
  try {
    identity = await fs.readFile(path.join(templateDir, 'identity.md'), 'utf-8');
  } catch {
    identity = DEFAULT_IDENTITY;
  }

  // Read skills from template
  const skills = await readTemplateSkills(templateDir);

  // Call the engine's /init endpoint
  const response = await engineFetch(agentId, '/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity,
      memory: DEFAULT_MEMORY,
      skills,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Engine /init failed (${response.status}): ${text}`);
  }

  return await response.json() as { initialized: boolean; reason?: string };
}
