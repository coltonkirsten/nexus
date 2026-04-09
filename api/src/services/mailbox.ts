import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { MailMessage, MailDirection, FileAttachment } from '../types.js';

// Simple async mutex (same pattern as teams.ts)
let mailboxLock: Promise<void> = Promise.resolve();

function withMailboxLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = mailboxLock;
  let resolve: () => void;
  mailboxLock = new Promise<void>(r => { resolve = r; });
  return release.then(fn).finally(() => resolve!());
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const MAILBOX_DIR = path.join(DATA_DIR, 'mailbox');

const MAX_MESSAGES = 500;

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(MAILBOX_DIR, { recursive: true });
}

function getMailboxPath(teamId: string): string {
  return path.join(MAILBOX_DIR, `${teamId}.json`);
}

async function loadMailbox(teamId: string): Promise<MailMessage[]> {
  await ensureDirectories();
  try {
    const data = await fs.readFile(getMailboxPath(teamId), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveMailbox(teamId: string, messages: MailMessage[]): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(getMailboxPath(teamId), JSON.stringify(messages, null, 2));
}

export async function sendMail(mail: Omit<MailMessage, 'id' | 'timestamp' | 'read'>): Promise<MailMessage> {
  return withMailboxLock(async () => {
    const messages = await loadMailbox(mail.teamId);

    const message: MailMessage = {
      ...mail,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      read: mail.direction === 'human_to_agent', // human_to_agent messages are "read" by default (human sent them)
    };

    messages.push(message);

    // Cap at MAX_MESSAGES
    if (messages.length > MAX_MESSAGES) {
      messages.splice(0, messages.length - MAX_MESSAGES);
    }

    await saveMailbox(mail.teamId, messages);
    return message;
  });
}

export interface GetMailboxOptions {
  direction?: MailDirection;
  unreadOnly?: boolean;
  limit?: number;
}

export async function getMailbox(teamId: string, options?: GetMailboxOptions): Promise<MailMessage[]> {
  const messages = await loadMailbox(teamId);
  let filtered = messages;

  if (options?.direction) {
    filtered = filtered.filter(m => m.direction === options.direction);
  }

  if (options?.unreadOnly) {
    filtered = filtered.filter(m => !m.read);
  }

  if (options?.limit && options.limit > 0) {
    filtered = filtered.slice(-options.limit);
  }

  return filtered;
}

export async function markAsRead(teamId: string, messageId: string): Promise<MailMessage | null> {
  return withMailboxLock(async () => {
    const messages = await loadMailbox(teamId);
    const message = messages.find(m => m.id === messageId);
    if (!message) return null;

    message.read = true;
    await saveMailbox(teamId, messages);
    return message;
  });
}

export async function markAllAsRead(teamId: string): Promise<number> {
  return withMailboxLock(async () => {
    const messages = await loadMailbox(teamId);
    let count = 0;

    for (const m of messages) {
      if (m.direction === 'agent_to_human' && !m.read) {
        m.read = true;
        count++;
      }
    }

    if (count > 0) {
      await saveMailbox(teamId, messages);
    }

    return count;
  });
}

export async function getUnreadCount(teamId: string): Promise<number> {
  const messages = await loadMailbox(teamId);
  return messages.filter(m => m.direction === 'agent_to_human' && !m.read).length;
}

export async function getAllUnreadCounts(): Promise<Record<string, number>> {
  await ensureDirectories();
  const counts: Record<string, number> = {};

  try {
    const files = await fs.readdir(MAILBOX_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const teamId = file.replace('.json', '');
      counts[teamId] = await getUnreadCount(teamId);
    }
  } catch {
    // Directory might not exist yet
  }

  return counts;
}

export async function deleteMailboxForTeam(teamId: string): Promise<void> {
  try {
    await fs.unlink(getMailboxPath(teamId));
  } catch {
    // File might not exist
  }
}
