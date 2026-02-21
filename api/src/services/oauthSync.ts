import { exec } from 'child_process';
import { promisify } from 'util';
import { getCredentials, setCredentials } from './credentials.js';

const execAsync = promisify(exec);

// Sync interval: 5 minutes
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Keychain service name for Claude Code credentials
const KEYCHAIN_SERVICE = 'Claude Code-credentials';

let syncIntervalId: NodeJS.Timeout | null = null;

/**
 * Fetches the OAuth access token from the macOS keychain.
 * Returns null if not found or if not on macOS.
 */
async function getKeychainToken(): Promise<string | null> {
  // Only run on macOS
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    const { stdout } = await execAsync(
      `security find-generic-password -s "${KEYCHAIN_SERVICE}" -w`
    );

    const rawJson = stdout.trim();
    if (!rawJson) {
      return null;
    }

    // Parse the JSON and extract the OAuth access token
    const credentials = JSON.parse(rawJson);
    const accessToken = credentials?.claudeAiOauth?.accessToken;

    if (!accessToken || typeof accessToken !== 'string') {
      return null;
    }

    return accessToken;
  } catch (error) {
    // Security command fails if keychain item doesn't exist or access is denied
    // This is expected in many cases, so don't log as error
    return null;
  }
}

/**
 * Checks if the keychain token differs from the stored credential,
 * and updates the credential store if different.
 */
async function syncOAuthToken(): Promise<boolean> {
  try {
    const keychainToken = await getKeychainToken();

    if (!keychainToken) {
      // No token in keychain, nothing to sync
      return false;
    }

    // Get current stored token
    const cliCreds = await getCredentials('cli');
    const storedToken = cliCreds.CLAUDE_CODE_OAUTH_TOKEN;

    if (storedToken === keychainToken) {
      // Tokens are the same, no sync needed
      return false;
    }

    // Token is different, update the credential store
    console.log('[OAuth Sync] Detected new OAuth token in keychain, updating credential store');
    await setCredentials('cli', { CLAUDE_CODE_OAUTH_TOKEN: keychainToken });
    console.log('[OAuth Sync] OAuth token updated successfully');

    return true;
  } catch (error) {
    console.error('[OAuth Sync] Error syncing OAuth token:', error);
    return false;
  }
}

/**
 * Starts the OAuth token sync loop.
 * Runs immediately once, then every 5 minutes.
 */
export function startOAuthSyncLoop(): void {
  if (syncIntervalId) {
    console.log('[OAuth Sync] Sync loop already running');
    return;
  }

  console.log(`[OAuth Sync] Starting OAuth sync loop (interval: ${SYNC_INTERVAL_MS / 1000 / 60} minutes)`);

  // Run initial sync after a short delay
  setTimeout(async () => {
    const synced = await syncOAuthToken();
    if (synced) {
      console.log('[OAuth Sync] Initial sync completed with update');
    }
  }, 3000);

  // Start the interval
  syncIntervalId = setInterval(syncOAuthToken, SYNC_INTERVAL_MS);
}

/**
 * Stops the OAuth token sync loop.
 */
export function stopOAuthSyncLoop(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.log('[OAuth Sync] Sync loop stopped');
  }
}

/**
 * Manually trigger a sync check (useful for testing or on-demand sync).
 */
export async function triggerOAuthSync(): Promise<boolean> {
  return syncOAuthToken();
}
