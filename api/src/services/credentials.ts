import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCellType } from './cellTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');

// Simple async mutex to prevent concurrent read-modify-write races
let credLock: Promise<void> = Promise.resolve();

function withCredLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = credLock;
  let resolve: () => void;
  credLock = new Promise<void>(r => { resolve = r; });
  return release.then(fn).finally(() => resolve!());
}

type CredentialStore = Record<string, Record<string, string>>;

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadStore(): Promise<CredentialStore> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveStore(store: CredentialStore): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(store, null, 2));
}

export async function getCredentials(cellType: string): Promise<Record<string, string>> {
  const store = await loadStore();
  return store[cellType] || {};
}

export async function getAllCredentials(): Promise<CredentialStore> {
  return loadStore();
}

export async function setCredentials(cellType: string, values: Record<string, string>): Promise<void> {
  return withCredLock(async () => {
    const store = await loadStore();
    // Merge with existing — allows partial updates
    store[cellType] = { ...(store[cellType] || {}), ...values };
    // Remove empty string values
    for (const [key, val] of Object.entries(store[cellType])) {
      if (val === '') delete store[cellType][key];
    }
    await saveStore(store);
  });
}

export async function deleteCredentials(cellType: string): Promise<void> {
  return withCredLock(async () => {
    const store = await loadStore();
    delete store[cellType];
    await saveStore(store);
  });
}

/**
 * Returns credential env vars for a cell type as ["KEY=value", ...] for Docker container env.
 * Includes all credentials stored for the given cell type.
 */
export async function getCredentialEnvVars(cellType: string): Promise<string[]> {
  const creds = await getCredentials(cellType);
  return Object.entries(creds)
    .filter(([, val]) => val && val.length > 0)
    .map(([key, val]) => `${key}=${val}`);
}

/**
 * Returns credentials with values masked (last 4 chars only) for display in the UI.
 */
export function maskCredentials(creds: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, val] of Object.entries(creds)) {
    if (val.length > 8) {
      masked[key] = '***' + val.slice(-4);
    } else if (val.length > 0) {
      masked[key] = '****';
    } else {
      masked[key] = '';
    }
  }
  return masked;
}

/**
 * Migration: if ANTHROPIC_API_KEY exists in env but not in credential store,
 * seed the store with it so existing users don't lose access.
 * Note: CLI cell type uses OAuth only, not API keys.
 */
export async function migrateFromEnv(): Promise<void> {
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (!envKey) return;

  const sdkCreds = await getCredentials('sdk');
  if (!sdkCreds.ANTHROPIC_API_KEY) {
    console.log('[Credentials] Migrating ANTHROPIC_API_KEY from env to credential store');
    await setCredentials('sdk', { ANTHROPIC_API_KEY: envKey });
  }
  // CLI uses OAuth only - do not seed API key
}
