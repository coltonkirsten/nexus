import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import tar from 'tar-stream';
import path from 'path';
import {
  createTeam,
  getTeam,
  listTeams,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  addAgentToTeam,
  removeAgentFromTeam,
  getTeamEvents,
} from '../services/teams.js';
import { getAgent, listAgents } from '../services/agents.js';
import { readFromVolume } from '../services/docker.js';
import {
  getRun,
  getRunsForTeam,
  getActiveRuns,
} from '../services/runs.js';

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv',
  '.mp3', '.wav', '.ogg', '.flac', '.aac',
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.exe', '.dll', '.so', '.dylib',
  '.bin', '.dat', '.db', '.sqlite',
]);

const CONTAINER_TIMEOUT = 10000;

async function engineFetchForAgent(agentId: string, urlPath: string): Promise<globalThis.Response | null> {
  const agent = await getAgent(agentId);
  if (!agent || !agent.port || agent.status !== 'running') return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONTAINER_TIMEOUT);

  try {
    const response = await fetch(`http://localhost:${agent.port}${urlPath}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok ? response : null;
  } catch {
    clearTimeout(timeoutId);
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

function parseTarDirectory(archiveStream: NodeJS.ReadableStream, containerPath: string): Promise<DirectoryEntry[]> {
  return new Promise<DirectoryEntry[]>((resolve, reject) => {
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
}

interface FileContent {
  content: string;
  encoding: 'utf-8' | 'base64';
}

function parseTarFile(archiveStream: NodeJS.ReadableStream, filePath: string): Promise<FileContent | null> {
  const isBinary = BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  return new Promise<FileContent | null>((resolve, reject) => {
    const extract = tar.extract();
    let result: FileContent | null = null;

    extract.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        if (!header.name.endsWith('/')) {
          const buf = Buffer.concat(chunks);
          result = isBinary
            ? { content: buf.toString('base64'), encoding: 'base64' }
            : { content: buf.toString('utf-8'), encoding: 'utf-8' };
        }
        next();
      });
      stream.resume();
    });

    extract.on('finish', () => resolve(result));
    extract.on('error', reject);

    if (archiveStream instanceof Readable) {
      archiveStream.pipe(extract);
    } else {
      (archiveStream as NodeJS.ReadableStream).pipe(extract);
    }
  });
}

const router = Router();

// GET /api/teams - List all teams
router.get('/', async (_req: Request, res: Response) => {
  try {
    const teams = await listTeams();
    res.json({ teams });
  } catch (error) {
    console.error('Error listing teams:', error);
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

// POST /api/teams - Create team
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Team name is required' });
      return;
    }

    const team = await createTeam(name, description);
    res.status(201).json({ team });
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// GET /api/teams/:id - Get team with members
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const team = await getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const members = await getTeamMembers(req.params.id);
    res.json({ team, members });
  } catch (error) {
    console.error('Error getting team:', error);
    res.status(500).json({ error: 'Failed to get team' });
  }
});

// PATCH /api/teams/:id - Update team
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const updates: { name?: string; description?: string } = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const team = await updateTeam(req.params.id, updates);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    res.json({ team });
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// DELETE /api/teams/:id - Delete team (must be empty)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const team = await getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    await deleteTeam(req.params.id);
    res.json({ success: true, message: 'Team deleted' });
  } catch (error) {
    console.error('Error deleting team:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete team';
    res.status(409).json({ error: msg });
  }
});

// GET /api/teams/:id/members - List team members
router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const team = await getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const members = await getTeamMembers(req.params.id);
    res.json({ members });
  } catch (error) {
    console.error('Error getting team members:', error);
    res.status(500).json({ error: 'Failed to get team members' });
  }
});

// POST /api/teams/:id/members - Add agent to team
router.post('/:id/members', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      res.status(400).json({ error: 'agentId is required' });
      return;
    }

    await addAgentToTeam(agentId, req.params.id);
    res.json({ success: true, message: 'Agent added to team' });
  } catch (error) {
    console.error('Error adding agent to team:', error);
    const msg = error instanceof Error ? error.message : 'Failed to add agent to team';
    res.status(400).json({ error: msg });
  }
});

// DELETE /api/teams/:id/members/:agentId - Remove agent from team
router.delete('/:id/members/:agentId', async (req: Request, res: Response) => {
  try {
    await removeAgentFromTeam(req.params.agentId);
    res.json({ success: true, message: 'Agent removed from team' });
  } catch (error) {
    console.error('Error removing agent from team:', error);
    const msg = error instanceof Error ? error.message : 'Failed to remove agent from team';
    res.status(400).json({ error: msg });
  }
});

// GET /api/teams/:id/events - Get team events
router.get('/:id/events', async (req: Request, res: Response) => {
  try {
    const team = await getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const events = await getTeamEvents(req.params.id, limit);
    res.json({ events });
  } catch (error) {
    console.error('Error getting team events:', error);
    res.status(500).json({ error: 'Failed to get team events' });
  }
});

// GET /api/teams/:id/shared - List shared drive files
router.get('/:id/shared', async (req: Request, res: Response) => {
  try {
    const team = await getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Try via a running team member first
    const members = await getTeamMembers(req.params.id);
    const runningMember = members.find(m => m.status === 'running');

    if (runningMember) {
      const response = await engineFetchForAgent(
        runningMember.id,
        `/files/list?path=${encodeURIComponent('/shared')}`
      );
      if (response) {
        const data = await response.json() as { entries: DirectoryEntry[] };
        res.json({ entries: data.entries });
        return;
      }
    }

    // Fallback: read from Docker volume directly
    try {
      const archiveStream = await readFromVolume(team.sharedVolume, '/');
      const entries = await parseTarDirectory(archiveStream, '/shared');
      res.json({ entries });
    } catch {
      res.json({ entries: [] });
    }
  } catch (error) {
    console.error('Error listing shared drive:', error);
    res.status(500).json({ error: 'Failed to list shared drive' });
  }
});

// GET /api/teams/:id/shared/file - Read shared drive file
router.get('/:id/shared/file', async (req: Request, res: Response) => {
  try {
    const team = await getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ error: 'File path required' });
      return;
    }

    const containerPath = filePath.startsWith('/shared') ? filePath : `/shared/${filePath}`;

    // Try via a running team member first
    const members = await getTeamMembers(req.params.id);
    const runningMember = members.find(m => m.status === 'running');

    if (runningMember) {
      const response = await engineFetchForAgent(
        runningMember.id,
        `/files/read?path=${encodeURIComponent(containerPath)}`
      );
      if (response) {
        const data = await response.json() as { content: string; encoding?: 'utf-8' | 'base64' };
        res.json({ content: data.content, encoding: data.encoding || 'utf-8' });
        return;
      }
    }

    // Fallback: read from Docker volume directly
    const volPath = filePath.startsWith('/shared') ? filePath.replace('/shared', '') : `/${filePath}`;
    try {
      const archiveStream = await readFromVolume(team.sharedVolume, volPath || '/');
      const result = await parseTarFile(archiveStream, volPath);
      if (result) {
        res.json(result);
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    console.error('Error reading shared drive file:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// --- Run Endpoints ---

// GET /api/teams/:id/runs - List all runs for team
router.get('/:id/runs', async (req: Request, res: Response) => {
  try {
    const team = await getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const runs = await getRunsForTeam(req.params.id, limit);
    res.json({ runs });
  } catch (error) {
    console.error('Error listing runs:', error);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// GET /api/teams/:id/runs/active - Get active runs for team
router.get('/:id/runs/active', async (req: Request, res: Response) => {
  try {
    const team = await getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const runs = await getActiveRuns(req.params.id);
    res.json({ runs });
  } catch (error) {
    console.error('Error getting active runs:', error);
    res.status(500).json({ error: 'Failed to get active runs' });
  }
});

// GET /api/teams/:id/runs/:runId - Get specific run
router.get('/:id/runs/:runId', async (req: Request, res: Response) => {
  try {
    const team = await getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const run = await getRun(req.params.id, req.params.runId);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.json({ run });
  } catch (error) {
    console.error('Error getting run:', error);
    res.status(500).json({ error: 'Failed to get run' });
  }
});

// --- Timeline Endpoint ---

// GET /api/teams/:id/timeline - Get unified timeline of events, runs, and agent activity
router.get('/:id/timeline', async (req: Request, res: Response) => {
  try {
    const team = await getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const startParam = req.query.start as string | undefined;
    const endParam = req.query.end as string | undefined;
    const groupByRun = req.query.groupByRun === 'true';

    // Parse time range
    const start = startParam ? new Date(startParam) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h
    const end = endParam ? new Date(endParam) : new Date();

    // Get all events within time range
    const allEvents = await getTeamEvents(req.params.id);
    const filteredEvents = allEvents.filter(e => {
      const eventTime = new Date(e.timestamp);
      return eventTime >= start && eventTime <= end;
    });

    // Get all runs within time range
    const allRuns = await getRunsForTeam(req.params.id);
    const filteredRuns = allRuns.filter(r => {
      const runStart = new Date(r.startedAt);
      const runEnd = r.completedAt ? new Date(r.completedAt) : new Date();
      return runStart <= end && runEnd >= start;
    });

    // Get team members (agents)
    const members = await getTeamMembers(req.params.id);

    // Transform runs to match dashboard expected format
    const transformedRuns = filteredRuns.map(run => ({
      id: run.id,
      teamId: run.teamId,
      agentId: run.triggerAgentId,
      agentName: run.triggerAgentName,
      trigger: run.triggerSource,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      eventIds: run.eventIds,
      metadata: run.metadata,
      // Compute duration if completed
      durationMs: run.completedAt
        ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
        : undefined,
    }));

    // Build response
    if (groupByRun) {
      // Group events by runId
      const eventsByRun: Record<string, typeof filteredEvents> = { unassociated: [] };

      for (const run of filteredRuns) {
        eventsByRun[run.id] = [];
      }

      for (const event of filteredEvents) {
        if (event.runId && eventsByRun[event.runId]) {
          eventsByRun[event.runId].push(event);
        } else {
          eventsByRun.unassociated.push(event);
        }
      }

      res.json({
        timeRange: { start: start.toISOString(), end: end.toISOString() },
        events: filteredEvents, // Flat array for timeline visualization
        runs: transformedRuns.map(run => ({
          ...run,
          events: eventsByRun[run.id] || [],
        })),
        unassociatedEvents: eventsByRun.unassociated,
        agents: members,
      });
    } else {
      // Return flat timeline
      res.json({
        timeRange: { start: start.toISOString(), end: end.toISOString() },
        events: filteredEvents,
        runs: transformedRuns,
        agents: members,
      });
    }
  } catch (error) {
    console.error('Error getting timeline:', error);
    res.status(500).json({ error: 'Failed to get timeline' });
  }
});

export default router;
