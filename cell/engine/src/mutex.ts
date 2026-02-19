import { mkdir, rm, readFile, writeFile } from "fs/promises";
import { join } from "path";

const LOCK_DIR = "/shared/.locks";
const STALE_LOCK_MS = 30_000;
const RETRY_INTERVAL_MS = 100;
const MAX_WAIT_MS = 60_000;

const agentId = process.env.AGENT_ID || "unknown";

interface LockMeta {
  agentId: string;
  timestamp: number;
}

function lockPath(resource: string): string {
  // Sanitize resource name to a safe directory name
  const safe = resource.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(LOCK_DIR, `${safe}.lock`);
}

export async function acquireLock(resource: string): Promise<void> {
  const dir = lockPath(resource);
  const metaPath = join(dir, "meta.json");
  const start = Date.now();

  // Ensure .locks parent directory exists
  await mkdir(LOCK_DIR, { recursive: true });

  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      // mkdir is atomic on POSIX — fails if dir already exists
      await mkdir(dir, { recursive: false });

      // We got the lock — write metadata
      const meta: LockMeta = { agentId, timestamp: Date.now() };
      await writeFile(metaPath, JSON.stringify(meta), "utf-8");
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        // Lock exists — check if it's stale
        try {
          const raw = await readFile(metaPath, "utf-8");
          const meta: LockMeta = JSON.parse(raw);
          if (Date.now() - meta.timestamp > STALE_LOCK_MS) {
            // Break stale lock
            await rm(dir, { recursive: true, force: true });
            continue; // Retry immediately
          }
        } catch {
          // Can't read meta — lock might be partially created, wait
        }

        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
      } else {
        throw err;
      }
    }
  }

  throw new Error(`Timed out acquiring lock for "${resource}" after ${MAX_WAIT_MS}ms`);
}

export async function releaseLock(resource: string): Promise<void> {
  const dir = lockPath(resource);
  await rm(dir, { recursive: true, force: true });
}

export async function withLock<T>(resource: string, fn: () => Promise<T>): Promise<T> {
  await acquireLock(resource);
  try {
    return await fn();
  } finally {
    await releaseLock(resource);
  }
}
