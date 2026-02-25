import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// Maximum number of log entries to persist per agent
const MAX_LOGS_PER_AGENT = 500;

interface LogEntry {
  type: string;
  timestamp?: string;
  data?: unknown;
  [key: string]: unknown;
}

async function ensureLogsDir(): Promise<void> {
  await fs.mkdir(LOGS_DIR, { recursive: true });
}

function getLogsPath(agentId: string): string {
  return path.join(LOGS_DIR, `${agentId}.json`);
}

/**
 * Save logs for an agent (called before rebuild/stop)
 */
export async function saveAgentLogs(agentId: string, logs: LogEntry[]): Promise<void> {
  await ensureLogsDir();

  // Load existing logs and merge
  const existing = await loadAgentLogs(agentId);

  // Create a map to deduplicate by timestamp + type
  const logMap = new Map<string, LogEntry>();

  for (const log of existing) {
    const key = `${log.timestamp || ''}-${log.type}`;
    logMap.set(key, log);
  }

  for (const log of logs) {
    const key = `${log.timestamp || ''}-${log.type}`;
    logMap.set(key, log);
  }

  // Convert back to array and sort by timestamp
  let merged = Array.from(logMap.values());
  merged.sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeA - timeB;
  });

  // Trim to max logs (keep most recent)
  if (merged.length > MAX_LOGS_PER_AGENT) {
    merged = merged.slice(-MAX_LOGS_PER_AGENT);
  }

  await fs.writeFile(getLogsPath(agentId), JSON.stringify(merged, null, 2));
  console.log(`[AgentLogs] Saved ${merged.length} logs for agent ${agentId.slice(0, 8)}`);
}

/**
 * Load persisted logs for an agent
 */
export async function loadAgentLogs(agentId: string): Promise<LogEntry[]> {
  try {
    const data = await fs.readFile(getLogsPath(agentId), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Get merged logs (persisted + live from engine)
 */
export async function getMergedLogs(
  agentId: string,
  liveLogs: LogEntry[]
): Promise<LogEntry[]> {
  const persisted = await loadAgentLogs(agentId);

  // Create a map to deduplicate
  const logMap = new Map<string, LogEntry>();

  for (const log of persisted) {
    const key = `${log.timestamp || ''}-${log.type}`;
    logMap.set(key, log);
  }

  for (const log of liveLogs) {
    const key = `${log.timestamp || ''}-${log.type}`;
    logMap.set(key, log);
  }

  // Convert back to array and sort by timestamp
  const merged = Array.from(logMap.values());
  merged.sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeA - timeB;
  });

  return merged;
}

/**
 * Delete persisted logs for an agent
 */
export async function deleteAgentLogs(agentId: string): Promise<void> {
  try {
    await fs.unlink(getLogsPath(agentId));
  } catch {
    // File might not exist
  }
}
