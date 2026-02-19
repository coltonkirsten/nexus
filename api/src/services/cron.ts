import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { CronJob, CronJobState, CronRunRecord, Schedule } from '../types.js';

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
const CRON_JOBS_FILE = path.join(DATA_DIR, 'cron-jobs.json');
const CRON_HISTORY_DIR = path.join(DATA_DIR, 'cron-history');

const MAX_HISTORY_PER_AGENT = 200;

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CRON_HISTORY_DIR, { recursive: true });
}

// --- Job state persistence ---

async function loadCronJobState(): Promise<CronJobState> {
  await ensureDirectories();
  try {
    const data = await fs.readFile(CRON_JOBS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { jobs: [] };
  }
}

async function saveCronJobState(state: CronJobState): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(CRON_JOBS_FILE, JSON.stringify(state, null, 2));
}

// --- History persistence ---

function getHistoryPath(agentId: string): string {
  return path.join(CRON_HISTORY_DIR, `${agentId}.json`);
}

async function loadHistory(agentId: string): Promise<CronRunRecord[]> {
  try {
    const data = await fs.readFile(getHistoryPath(agentId), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveHistory(agentId: string, records: CronRunRecord[]): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(getHistoryPath(agentId), JSON.stringify(records, null, 2));
}

// --- Public API ---

export async function createCronJob(
  agentId: string,
  name: string,
  schedule: Schedule,
  message: string,
  createdBy: 'user' | 'agent'
): Promise<CronJob> {
  return withStateLock(async () => {
    const state = await loadCronJobState();

    const now = new Date().toISOString();
    const job: CronJob = {
      id: uuidv4(),
      agentId,
      name,
      schedule,
      message,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      createdBy,
      runCount: 0,
    };

    state.jobs.push(job);
    await saveCronJobState(state);

    return job;
  });
}

export async function getCronJob(jobId: string): Promise<CronJob | null> {
  const state = await loadCronJobState();
  return state.jobs.find(j => j.id === jobId) || null;
}

export async function listCronJobsForAgent(agentId: string): Promise<CronJob[]> {
  const state = await loadCronJobState();
  return state.jobs.filter(j => j.agentId === agentId);
}

export async function listAllCronJobs(): Promise<CronJob[]> {
  const state = await loadCronJobState();
  return state.jobs;
}

export async function updateCronJob(
  jobId: string,
  updates: Partial<CronJob>
): Promise<CronJob | null> {
  return withStateLock(async () => {
    const state = await loadCronJobState();
    const index = state.jobs.findIndex(j => j.id === jobId);

    if (index === -1) {
      return null;
    }

    state.jobs[index] = {
      ...state.jobs[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await saveCronJobState(state);
    return state.jobs[index];
  });
}

export async function deleteCronJob(jobId: string): Promise<boolean> {
  return withStateLock(async () => {
    const state = await loadCronJobState();
    const index = state.jobs.findIndex(j => j.id === jobId);

    if (index === -1) {
      return false;
    }

    state.jobs.splice(index, 1);
    await saveCronJobState(state);

    return true;
  });
}

export async function deleteAllCronJobsForAgent(agentId: string): Promise<number> {
  return withStateLock(async () => {
    const state = await loadCronJobState();
    const before = state.jobs.length;
    state.jobs = state.jobs.filter(j => j.agentId !== agentId);
    const deleted = before - state.jobs.length;

    if (deleted > 0) {
      await saveCronJobState(state);
    }

    // Also delete history file
    try {
      await fs.unlink(getHistoryPath(agentId));
    } catch {
      // History file might not exist
    }

    return deleted;
  });
}

export async function recordCronRun(record: CronRunRecord): Promise<void> {
  return withStateLock(async () => {
    const records = await loadHistory(record.agentId);
    records.push(record);

    // Cap at MAX_HISTORY_PER_AGENT, trimming oldest entries
    const trimmed = records.length > MAX_HISTORY_PER_AGENT
      ? records.slice(records.length - MAX_HISTORY_PER_AGENT)
      : records;

    await saveHistory(record.agentId, trimmed);
  });
}

export async function getCronHistory(
  agentId: string,
  limit?: number
): Promise<CronRunRecord[]> {
  const records = await loadHistory(agentId);

  if (limit !== undefined && limit > 0) {
    return records.slice(-limit);
  }

  return records;
}
