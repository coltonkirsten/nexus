import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { Run, RunState, RunTriggerSource, RunStatus } from '../types.js';

// Simple async mutex (same pattern as teams.ts)
let runsLock: Promise<void> = Promise.resolve();

function withRunsLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = runsLock;
  let resolve: () => void;
  runsLock = new Promise<void>(r => { resolve = r; });
  return release.then(fn).finally(() => resolve!());
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const RUNS_DIR = path.join(DATA_DIR, 'runs');

const MAX_RUNS = 100;

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(RUNS_DIR, { recursive: true });
}

function getRunsPath(teamId: string): string {
  return path.join(RUNS_DIR, `${teamId}.json`);
}

async function loadRunState(teamId: string): Promise<RunState> {
  await ensureDirectories();
  try {
    const data = await fs.readFile(getRunsPath(teamId), 'utf-8');
    return JSON.parse(data);
  } catch {
    return { runs: [] };
  }
}

async function saveRunState(teamId: string, state: RunState): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(getRunsPath(teamId), JSON.stringify(state, null, 2));
}

// --- CRUD Operations ---

export interface CreateRunOptions {
  teamId: string;
  triggerSource: RunTriggerSource;
  triggerAgentId: string;
  triggerAgentName: string;
  metadata?: Record<string, unknown>;
}

export async function createRun(options: CreateRunOptions): Promise<Run> {
  return withRunsLock(async () => {
    const state = await loadRunState(options.teamId);

    // Deduplication: Check if there's already an active run with the same firstMessageId
    // This prevents retry storms from creating duplicate runs
    const firstMessageId = options.metadata?.firstMessageId as string | undefined;
    if (firstMessageId) {
      const existingActiveRun = state.runs.find(
        r => r.status === 'active' &&
             r.triggerAgentId === options.triggerAgentId &&
             (r.metadata?.firstMessageId as string | undefined) === firstMessageId
      );
      if (existingActiveRun) {
        console.log(`[Runs] Dedup: Found existing active run ${existingActiveRun.id} for message ${firstMessageId}, reusing`);
        return existingActiveRun;
      }
    }

    const run: Run = {
      id: uuidv4(),
      teamId: options.teamId,
      triggerSource: options.triggerSource,
      triggerAgentId: options.triggerAgentId,
      triggerAgentName: options.triggerAgentName,
      status: 'active',
      startedAt: new Date().toISOString(),
      agentIds: [options.triggerAgentId],
      eventIds: [],
      metadata: options.metadata,
    };

    state.runs.push(run);

    // Trim to max runs (remove oldest first)
    if (state.runs.length > MAX_RUNS) {
      state.runs = state.runs.slice(state.runs.length - MAX_RUNS);
    }

    await saveRunState(options.teamId, state);
    return run;
  });
}

export async function getRun(teamId: string, runId: string): Promise<Run | null> {
  const state = await loadRunState(teamId);
  return state.runs.find(r => r.id === runId) || null;
}

export async function getRunsForTeam(teamId: string, limit?: number): Promise<Run[]> {
  const state = await loadRunState(teamId);
  if (limit && limit > 0) {
    return state.runs.slice(-limit);
  }
  return state.runs;
}

export async function getActiveRuns(teamId: string): Promise<Run[]> {
  const state = await loadRunState(teamId);
  return state.runs.filter(r => r.status === 'active');
}

export async function addAgentToRun(teamId: string, runId: string, agentId: string): Promise<Run | null> {
  return withRunsLock(async () => {
    const state = await loadRunState(teamId);
    const run = state.runs.find(r => r.id === runId);
    if (!run) return null;

    if (!run.agentIds.includes(agentId)) {
      run.agentIds.push(agentId);
      await saveRunState(teamId, state);
    }

    return run;
  });
}

export async function addEventToRun(teamId: string, runId: string, eventId: string): Promise<Run | null> {
  return withRunsLock(async () => {
    const state = await loadRunState(teamId);
    const run = state.runs.find(r => r.id === runId);
    if (!run) return null;

    if (!run.eventIds.includes(eventId)) {
      run.eventIds.push(eventId);
      await saveRunState(teamId, state);
    }

    return run;
  });
}

export async function completeRun(
  teamId: string,
  runId: string,
  status: 'completed' | 'failed'
): Promise<Run | null> {
  return withRunsLock(async () => {
    const state = await loadRunState(teamId);
    const run = state.runs.find(r => r.id === runId);
    if (!run) return null;

    run.status = status;
    run.completedAt = new Date().toISOString();
    await saveRunState(teamId, state);

    return run;
  });
}

export async function deleteRunsForTeam(teamId: string): Promise<void> {
  try {
    await fs.unlink(getRunsPath(teamId));
  } catch {
    // File might not exist
  }
}
