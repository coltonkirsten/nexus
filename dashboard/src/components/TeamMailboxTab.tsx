import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCheck,
  PenSquare,
  X,
  Tag,
} from 'lucide-react';
import type { MailMessage } from '../types/agent';
import {
  getMailbox,
  sendMailToAgent,
  markMailAsRead,
  markAllMailAsRead,
} from '../api/mailbox';
import { getTeamMembers, type TeamMember } from '../api/teams';

interface TeamMailboxTabProps {
  teamId: string;
}

type FilterMode = 'all' | 'inbox' | 'sent';

const categoryColors: Record<string, { text: string; bg: string }> = {
  question: { text: 'text-blue-400', bg: 'bg-blue-500/10' },
  approval: { text: 'text-amber-400', bg: 'bg-amber-500/10' },
  status: { text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  deliverable: { text: 'text-purple-400', bg: 'bg-purple-500/10' },
  general: { text: 'text-[#7a7a8e]', bg: 'bg-[#1a1a2e]' },
};

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TeamMailboxTab({ teamId }: TeamMailboxTabProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<MailMessage | null>(null);

  // Compose form state
  const [composeAgentId, setComposeAgentId] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  const { data: messages = [] } = useQuery<MailMessage[]>({
    queryKey: ['mailbox', teamId],
    queryFn: () => getMailbox(teamId),
    refetchInterval: 5000,
  });

  const { data: members = [] } = useQuery<TeamMember[]>({
    queryKey: ['team-members', teamId],
    queryFn: () => getTeamMembers(teamId),
  });

  const markReadMutation = useMutation({
    mutationFn: (messageId: string) => markMailAsRead(teamId, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailbox', teamId] });
      queryClient.invalidateQueries({ queryKey: ['mailbox-unread', teamId] });
      queryClient.invalidateQueries({ queryKey: ['mailbox-unread-counts'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllMailAsRead(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailbox', teamId] });
      queryClient.invalidateQueries({ queryKey: ['mailbox-unread', teamId] });
      queryClient.invalidateQueries({ queryKey: ['mailbox-unread-counts'] });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (data: { agentId: string; subject: string; body: string; replyToId?: string }) =>
      sendMailToAgent(teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailbox', teamId] });
      setComposing(false);
      setReplyToMessage(null);
      setComposeAgentId('');
      setComposeSubject('');
      setComposeBody('');
    },
  });

  // Filter messages
  const filtered = messages.filter((m) => {
    if (filter === 'inbox') return m.direction === 'agent_to_human';
    if (filter === 'sent') return m.direction === 'human_to_agent';
    return true;
  });

  // Newest first
  const sorted = [...filtered].reverse();

  const selectedMessage = messages.find((m) => m.id === selectedId) || null;

  const unreadCount = messages.filter(
    (m) => m.direction === 'agent_to_human' && !m.read
  ).length;

  // Auto-mark as read when selecting
  useEffect(() => {
    if (selectedMessage && !selectedMessage.read && selectedMessage.direction === 'agent_to_human') {
      markReadMutation.mutate(selectedMessage.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire when selectedId changes
  }, [selectedId, selectedMessage?.read, selectedMessage?.direction]);

  const handleSelectMessage = (msg: MailMessage) => {
    setSelectedId(msg.id);
    setComposing(false);
    setReplyToMessage(null);
  };

  const handleCompose = () => {
    setComposing(true);
    setSelectedId(null);
    setReplyToMessage(null);
    setComposeAgentId('');
    setComposeSubject('');
    setComposeBody('');
  };

  const handleReply = (msg: MailMessage) => {
    setComposing(true);
    setReplyToMessage(msg);
    setComposeAgentId(msg.agentId);
    setComposeSubject(`Re: ${msg.subject}`);
    setComposeBody('');
  };

  const handleSend = () => {
    if (!composeAgentId || !composeSubject.trim() || !composeBody.trim()) return;
    sendMutation.mutate({
      agentId: composeAgentId,
      subject: composeSubject.trim(),
      body: composeBody.trim(),
      replyToId: replyToMessage?.id,
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1e1e3a] shrink-0">
        <div className="flex items-center gap-3">
          {/* Filter pills */}
          {(['all', 'inbox', 'sent'] as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-full transition-all duration-200 ${
                filter === f
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e]'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'inbox' && unreadCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-indigo-500 text-white rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark All Read
            </button>
          )}
          <button
            onClick={handleCompose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all duration-200"
          >
            <PenSquare className="w-3.5 h-3.5" />
            Compose
          </button>
        </div>
      </div>

      {/* Split pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Message list */}
        <div className="w-80 border-r border-[#1e1e3a] overflow-auto shrink-0">
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Mail className="w-10 h-10 mx-auto mb-3 text-[#1e1e3a]" />
                <p className="text-[#4a4a5e] text-sm">No messages</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#1e1e3a]/50">
              {sorted.map((msg) => {
                const isSelected = selectedId === msg.id;
                const isUnread = msg.direction === 'agent_to_human' && !msg.read;
                return (
                  <button
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg)}
                    className={`w-full text-left px-4 py-3 transition-all duration-200 ${
                      isSelected
                        ? 'bg-indigo-500/10 border-l-2 border-indigo-400'
                        : 'hover:bg-[#1a1a2e] border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Unread dot */}
                      <div className="pt-1.5 w-2 shrink-0">
                        {isUnread && (
                          <div className="w-2 h-2 rounded-full bg-indigo-400" />
                        )}
                      </div>

                      {/* Direction icon */}
                      <div className="pt-0.5 shrink-0">
                        {msg.direction === 'agent_to_human' ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-[#7a7a8e] truncate">
                            {msg.agentName}
                          </span>
                          <span className="text-[10px] text-[#4a4a5e] shrink-0">
                            {formatRelativeTime(msg.timestamp)}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${isUnread ? 'text-[#e0e0e8] font-medium' : 'text-[#7a7a8e]'}`}>
                          {msg.subject}
                        </p>
                        {msg.category && (
                          <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${categoryColors[msg.category]?.bg || ''} ${categoryColors[msg.category]?.text || ''}`}>
                            {msg.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Detail or compose */}
        <div className="flex-1 overflow-auto">
          {composing ? (
            /* Compose form */
            <div className="p-6 max-w-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-[#e0e0e8]">
                  {replyToMessage ? `Reply to: ${replyToMessage.subject}` : 'New Message'}
                </h3>
                <button
                  onClick={() => { setComposing(false); setReplyToMessage(null); }}
                  className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Agent selector */}
                <div>
                  <label className="block text-xs text-[#4a4a5e] mb-1.5">To Agent</label>
                  <select
                    value={composeAgentId}
                    onChange={(e) => setComposeAgentId(e.target.value)}
                    className="w-full bg-[#0f0f18] border border-[#1e1e3a] text-sm text-[#e0e0e8] rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select an agent...</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.status})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs text-[#4a4a5e] mb-1.5">Subject</label>
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="Message subject..."
                    className="w-full bg-[#0f0f18] border border-[#1e1e3a] text-sm text-[#e0e0e8] rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-[#4a4a5e]"
                  />
                </div>

                {/* Body */}
                <div>
                  <label className="block text-xs text-[#4a4a5e] mb-1.5">Message</label>
                  <textarea
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    placeholder="Write your message..."
                    rows={8}
                    className="w-full bg-[#0f0f18] border border-[#1e1e3a] text-sm text-[#e0e0e8] rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-[#4a4a5e] resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSend}
                    disabled={!composeAgentId || !composeSubject.trim() || !composeBody.trim() || sendMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sendMutation.isPending ? 'Sending...' : 'Send'}
                  </button>
                  <button
                    onClick={() => { setComposing(false); setReplyToMessage(null); }}
                    className="px-4 py-2 text-sm text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : selectedMessage ? (
            /* Message detail */
            <div className="p-6 max-w-2xl">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-base font-semibold text-[#e0e0e8]">{selectedMessage.subject}</h3>
                  {selectedMessage.category && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${categoryColors[selectedMessage.category]?.bg || ''} ${categoryColors[selectedMessage.category]?.text || ''}`}>
                      <Tag className="w-2.5 h-2.5 inline mr-1" />
                      {selectedMessage.category}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-[#4a4a5e]">
                  {selectedMessage.direction === 'agent_to_human' ? (
                    <>
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                      <span>From <span className="text-[#7a7a8e]">{selectedMessage.agentName}</span></span>
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
                      <span>To <span className="text-[#7a7a8e]">{selectedMessage.agentName}</span></span>
                    </>
                  )}
                  <span>{new Date(selectedMessage.timestamp).toLocaleString()}</span>
                </div>
              </div>

              {/* Body */}
              <div className="bg-[#0f0f18] border border-[#1e1e3a] rounded-xl p-4 mb-6">
                <p className="text-sm text-[#e0e0e8] whitespace-pre-wrap leading-relaxed">
                  {selectedMessage.body}
                </p>
              </div>

              {/* Actions */}
              {selectedMessage.direction === 'agent_to_human' && (
                <button
                  onClick={() => handleReply(selectedMessage)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-indigo-400 hover:text-indigo-300 border border-[#1e1e3a] hover:bg-indigo-500/10 rounded-xl transition-all duration-200"
                >
                  <Send className="w-3.5 h-3.5" />
                  Reply
                </button>
              )}
            </div>
          ) : (
            /* Empty state */
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Mail className="w-12 h-12 mx-auto mb-3 text-[#1e1e3a]" />
                <p className="text-[#4a4a5e] text-sm">Select a message to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
