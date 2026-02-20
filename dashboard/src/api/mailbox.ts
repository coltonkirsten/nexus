import axios from 'axios';
import type { MailMessage, MailDirection } from '../types/agent';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface GetMailboxOptions {
  direction?: MailDirection;
  unreadOnly?: boolean;
  limit?: number;
}

export async function getMailbox(teamId: string, options?: GetMailboxOptions): Promise<MailMessage[]> {
  const params: Record<string, string> = {};
  if (options?.direction) params.direction = options.direction;
  if (options?.unreadOnly) params.unreadOnly = 'true';
  if (options?.limit) params.limit = String(options.limit);

  const response = await api.get<{ messages: MailMessage[] }>(
    `/api/teams/${teamId}/mailbox`,
    { params }
  );
  return response.data.messages;
}

export async function sendMailToAgent(
  teamId: string,
  data: { agentId: string; subject: string; body: string; replyToId?: string }
): Promise<MailMessage> {
  const response = await api.post<{ message: MailMessage }>(
    `/api/teams/${teamId}/mailbox`,
    data
  );
  return response.data.message;
}

export async function markMailAsRead(teamId: string, messageId: string): Promise<MailMessage> {
  const response = await api.patch<{ message: MailMessage }>(
    `/api/teams/${teamId}/mailbox/${messageId}/read`
  );
  return response.data.message;
}

export async function markAllMailAsRead(teamId: string): Promise<void> {
  await api.post(`/api/teams/${teamId}/mailbox/mark-all-read`);
}

export async function getUnreadCount(teamId: string): Promise<number> {
  const response = await api.get<{ count: number }>(
    `/api/teams/${teamId}/mailbox/unread-count`
  );
  return response.data.count;
}

export async function getAllUnreadCounts(): Promise<Record<string, number>> {
  const response = await api.get<{ counts: Record<string, number> }>(
    '/api/teams/mailbox/unread-counts'
  );
  return response.data.counts;
}
