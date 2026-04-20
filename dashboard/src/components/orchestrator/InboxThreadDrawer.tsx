import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Send,
  Loader2,
  Reply,
} from 'lucide-react';
import type { MailMessage, FileAttachment } from '../../types/agent';
import { getMailbox, sendMailToAgent, markMailAsRead } from '../../api/mailbox';
import { MarkdownContent } from '../../utils/markdown';

interface InboxThreadDrawerProps {
  teamId: string;
  teamName: string;
  messageId: string;
  onClose: () => void;
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^(Re:\s*)+/i, '').trim();
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Given a flat message list and a selected message id, return the ordered
// list of messages in the same thread (root first, replies after) sorted by timestamp.
function buildThread(messages: MailMessage[], selectedId: string): MailMessage[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const selected = byId.get(selectedId);
  if (!selected) return [];

  // Walk up to the root
  let root: MailMessage = selected;
  while (root.replyToId && byId.has(root.replyToId)) {
    root = byId.get(root.replyToId)!;
  }

  // Collect any message whose chain leads back to root
  const inThread: MailMessage[] = [];
  for (const m of messages) {
    let cur: MailMessage | undefined = m;
    while (cur) {
      if (cur.id === root.id) {
        inThread.push(m);
        break;
      }
      cur = cur.replyToId ? byId.get(cur.replyToId) : undefined;
    }
  }

  inThread.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return inThread;
}

export function InboxThreadDrawer({ teamId, teamName, messageId, onClose }: InboxThreadDrawerProps) {
  const queryClient = useQueryClient();
  const [replyBody, setReplyBody] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<MailMessage[]>({
    queryKey: ['mailbox', teamId],
    queryFn: () => getMailbox(teamId),
    refetchInterval: 5000,
  });

  const thread = useMemo(() => buildThread(messages, messageId), [messages, messageId]);
  const root = thread[0];
  const latest = thread[thread.length - 1];

  // Pick the agent to reply to: the most recent agent_to_human message in the thread.
  const replyTarget = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i].direction === 'agent_to_human') return thread[i];
    }
    return latest;
  }, [thread, latest]);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markMailAsRead(teamId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailbox', teamId] });
      queryClient.invalidateQueries({ queryKey: ['mailbox-unread-counts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-unified-inbox'] });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (data: { agentId: string; subject: string; body: string; replyToId?: string; attachments?: FileAttachment[] }) =>
      sendMailToAgent(teamId, data),
    onSuccess: () => {
      setReplyBody('');
      queryClient.invalidateQueries({ queryKey: ['mailbox', teamId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-unified-inbox'] });
    },
  });

  // Mark unread agent_to_human messages as read when they appear in the drawer.
  useEffect(() => {
    for (const m of thread) {
      if (m.direction === 'agent_to_human' && !m.read) {
        markReadMutation.mutate(m.id);
      }
    }
    // Only runs when thread contents change; marking is idempotent server-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.length, thread.map((t) => t.id).join(',')]);

  // Scroll to bottom when the thread changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length]);

  // Esc closes the drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSend = () => {
    if (!replyTarget || !replyBody.trim() || sendMutation.isPending) return;
    const subject = root?.subject
      ? (root.subject.toLowerCase().startsWith('re:') ? root.subject : `Re: ${root.subject}`)
      : `Re: (no subject)`;
    sendMutation.mutate({
      agentId: replyTarget.agentId,
      subject,
      body: replyBody.trim(),
      replyToId: latest?.id,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-2xl h-full bg-[#0a0a0f] border-l border-[#1e1e3a] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#1e1e3a] shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-indigo-400">{teamName}</span>
              <span className="text-[10px] text-[#4a4a5e]">
                {thread.length} message{thread.length !== 1 ? 's' : ''}
              </span>
            </div>
            <h2 className="text-base font-semibold text-[#e0e0e8] truncate">
              {root ? normalizeSubject(root.subject) : 'Loading...'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200 shrink-0"
            aria-label="Close thread"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Thread messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {isLoading && thread.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-[#4a4a5e]" />
            </div>
          ) : thread.length === 0 ? (
            <p className="text-sm text-[#4a4a5e]">Message not found.</p>
          ) : (
            thread.map((msg, idx) => {
              const isFirst = idx === 0;
              const fromAgent = msg.direction === 'agent_to_human';
              return (
                <div
                  key={msg.id}
                  className={`border border-[#1e1e3a] rounded-xl bg-[#0f0f18] ${isFirst ? '' : 'ml-4'}`}
                >
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1e1e3a]">
                    {fromAgent ? (
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    )}
                    <span className="text-xs text-[#e0e0e8]">
                      {fromAgent ? msg.agentName : `You → ${msg.agentName}`}
                    </span>
                    {!msg.read && fromAgent && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    )}
                    <span className="ml-auto text-[10px] text-[#4a4a5e]">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  <div className="px-4 py-3 text-sm text-[#c0c0d0]">
                    <MarkdownContent text={msg.body} />
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply composer */}
        {replyTarget && (
          <div className="border-t border-[#1e1e3a] shrink-0">
            {/* Parent preview */}
            <div className="px-5 pt-3 pb-2">
              <div className="flex items-center gap-2 text-[10px] text-[#4a4a5e] mb-1.5">
                <Reply className="w-3 h-3" />
                Replying to <span className="text-[#7a7a8e]">{latest?.agentName}</span>
                {latest && (
                  <span className="text-[#4a4a5e]">• {formatTime(latest.timestamp)}</span>
                )}
              </div>
              {latest && (
                <p className="text-[11px] text-[#4a4a5e] line-clamp-2 pl-4 border-l-2 border-[#1e1e3a]">
                  {latest.body.slice(0, 240)}
                  {latest.body.length > 240 && '…'}
                </p>
              )}
            </div>
            <div className="px-5 pb-4">
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write a reply… (⌘+Enter to send)"
                rows={3}
                className="w-full bg-[#0f0f18] border border-[#1e1e3a] text-sm text-[#e0e0e8] rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-[#4a4a5e] resize-none"
              />
              <div className="flex items-center justify-end mt-2">
                <button
                  onClick={handleSend}
                  disabled={!replyBody.trim() || sendMutation.isPending}
                  className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendMutation.isPending ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      Send
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
