import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeft,
  CheckCheck,
  PenSquare,
  X,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Reply,
  Paperclip,
  Image,
  FileText,
  Loader2,
  Bot,
  User,
} from 'lucide-react';
import type { MailMessage, FileAttachment } from '../types/agent';
import {
  getMailbox,
  sendMailToAgent,
  markMailAsRead,
  markAllMailAsRead,
  uploadFiles,
  getAttachmentUrl,
} from '../api/mailbox';
import { getTeamMembers, type TeamMember } from '../api/teams';
import { MarkdownContent } from '../utils/markdown';

interface TeamMailboxTabProps {
  teamId: string;
}

type FilterMode = 'all' | 'inbox' | 'sent';

// A thread is a group of messages linked by replyToId
interface Thread {
  id: string; // ID of the root message
  rootSubject: string; // Original subject (without Re: prefixes)
  messages: MailMessage[]; // All messages in thread, sorted by timestamp
  latestMessage: MailMessage; // Most recent message
  hasUnread: boolean; // Any unread messages in thread
  participantAgents: string[]; // Unique agent names involved
}

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

// Strip "Re: " prefixes to get the root subject
function normalizeSubject(subject: string): string {
  return subject.replace(/^(Re:\s*)+/i, '').trim();
}

// Build threads from flat message list
function buildThreads(messages: MailMessage[]): Thread[] {
  // Map each message by ID for quick lookup
  const byId = new Map(messages.map((m) => [m.id, m]));

  // Find the root of each message's thread
  function findRoot(msg: MailMessage): MailMessage {
    let current = msg;
    while (current.replyToId && byId.has(current.replyToId)) {
      current = byId.get(current.replyToId)!;
    }
    return current;
  }

  // Group messages by their root
  const threadMap = new Map<string, MailMessage[]>();
  for (const msg of messages) {
    const root = findRoot(msg);
    const list = threadMap.get(root.id) || [];
    list.push(msg);
    threadMap.set(root.id, list);
  }

  // Build Thread objects
  const threads: Thread[] = [];
  for (const [rootId, threadMessages] of threadMap.entries()) {
    // Sort by timestamp ascending
    threadMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const rootMsg = byId.get(rootId)!;
    const latestMsg = threadMessages[threadMessages.length - 1];
    const hasUnread = threadMessages.some((m) => m.direction === 'agent_to_human' && !m.read);
    const agents = [...new Set(threadMessages.map((m) => m.agentName))];

    threads.push({
      id: rootId,
      rootSubject: normalizeSubject(rootMsg.subject),
      messages: threadMessages,
      latestMessage: latestMsg,
      hasUnread,
      participantAgents: agents,
    });
  }

  // Sort threads by latest message timestamp descending
  threads.sort((a, b) => new Date(b.latestMessage.timestamp).getTime() - new Date(a.latestMessage.timestamp).getTime());

  return threads;
}

export function TeamMailboxTab({ teamId }: TeamMailboxTabProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<MailMessage | null>(null);

  // Mobile responsiveness: track if we're showing detail view on mobile
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  // Compose form state
  const [composeAgentId, setComposeAgentId] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const { data: messages = [] } = useQuery<MailMessage[]>({
    queryKey: ['mailbox', teamId],
    queryFn: () => getMailbox(teamId),
    refetchInterval: 2000,
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
    mutationFn: (data: { agentId: string; subject: string; body: string; replyToId?: string; attachments?: FileAttachment[] }) =>
      sendMailToAgent(teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailbox', teamId] });
      setComposing(false);
      setReplyToMessage(null);
      setComposeAgentId('');
      setComposeSubject('');
      setComposeBody('');
      setPendingFiles([]);
    },
  });

  // Filter messages first
  const filtered = useMemo(() => {
    return messages.filter((m) => {
      if (filter === 'inbox') return m.direction === 'agent_to_human';
      if (filter === 'sent') return m.direction === 'human_to_agent';
      return true;
    });
  }, [messages, filter]);

  // Build threads from filtered messages
  const threads = useMemo(() => buildThreads(filtered), [filtered]);

  const selectedThread = threads.find((t) => t.id === selectedThreadId) || null;

  const unreadCount = messages.filter(
    (m) => m.direction === 'agent_to_human' && !m.read
  ).length;

  // Auto-expand latest message when selecting a thread
  useEffect(() => {
    if (selectedThread) {
      setExpandedMessageId(selectedThread.latestMessage.id);
    }
  }, [selectedThreadId]);

  // Mark message as read when expanded
  useEffect(() => {
    if (expandedMessageId) {
      const msg = messages.find((m) => m.id === expandedMessageId);
      if (msg && !msg.read && msg.direction === 'agent_to_human') {
        markReadMutation.mutate(msg.id);
      }
    }
  }, [expandedMessageId]);

  const handleSelectThread = (thread: Thread) => {
    setSelectedThreadId(thread.id);
    setComposing(false);
    setReplyToMessage(null);
    setMobileShowDetail(true);
  };

  const handleCompose = () => {
    setComposing(true);
    setSelectedThreadId(null);
    setReplyToMessage(null);
    setComposeAgentId('');
    setComposeSubject('');
    setComposeBody('');
    setMobileShowDetail(true);
  };

  const handleMobileBack = () => {
    setMobileShowDetail(false);
    setSelectedThreadId(null);
    setComposing(false);
    setReplyToMessage(null);
  };

  const handleReply = (msg: MailMessage) => {
    setComposing(true);
    setReplyToMessage(msg);
    setComposeAgentId(msg.agentId);
    // Keep subject chain for threading
    const subject = msg.subject.toLowerCase().startsWith('re:') ? msg.subject : `Re: ${msg.subject}`;
    setComposeSubject(subject);
    setComposeBody('');
    setPendingFiles([]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles((prev) => [...prev, ...files].slice(0, 5)); // Max 5 files
    e.target.value = ''; // Reset input
  };

  const handleRemoveFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!composeAgentId || !composeSubject.trim() || !composeBody.trim()) return;
    if (isUploading || sendMutation.isPending) return;

    let attachments: FileAttachment[] | undefined;

    // Upload files first if any
    if (pendingFiles.length > 0) {
      setIsUploading(true);
      try {
        attachments = await uploadFiles(pendingFiles);
      } catch (err) {
        console.error('Failed to upload files:', err);
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    sendMutation.mutate({
      agentId: composeAgentId,
      subject: composeSubject.trim(),
      body: composeBody.trim(),
      replyToId: replyToMessage?.id,
      attachments,
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const isImageFile = (filename: string): boolean => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar - hidden on mobile when showing detail view */}
      <div className={`flex items-center justify-between px-4 md:px-6 py-3 border-b border-[#1e1e3a] shrink-0 ${mobileShowDetail ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center gap-2 md:gap-3">
          {/* Filter pills */}
          {(['all', 'inbox', 'sent'] as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 md:px-3 py-1 text-xs rounded-full transition-all duration-200 ${
                filter === f
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e]'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'inbox' && unreadCount > 0 && (
                <span className="ml-1 md:ml-1.5 px-1.5 py-0.5 text-[10px] bg-indigo-500 text-white rounded-full">
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
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
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
            <span className="hidden sm:inline">Compose</span>
          </button>
        </div>
      </div>

      {/* Split pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Thread list - hidden on mobile when showing detail */}
        <div className={`w-full md:w-80 border-r border-[#1e1e3a] overflow-auto md:shrink-0 ${mobileShowDetail ? 'hidden md:block' : 'block'}`}>
          {threads.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Mail className="w-10 h-10 mx-auto mb-3 text-[#1e1e3a]" />
                <p className="text-[#4a4a5e] text-sm">No messages</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#1e1e3a]/50">
              {threads.map((thread) => {
                const isSelected = selectedThreadId === thread.id;
                const messageCount = thread.messages.length;
                const latestDir = thread.latestMessage.direction;

                return (
                  <button
                    key={thread.id}
                    onClick={() => handleSelectThread(thread)}
                    className={`w-full text-left px-4 py-3 transition-all duration-200 ${
                      isSelected
                        ? 'bg-indigo-500/10 border-l-2 border-indigo-400'
                        : 'hover:bg-[#1a1a2e] border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Unread dot */}
                      <div className="pt-1.5 w-2 shrink-0">
                        {thread.hasUnread && (
                          <div className="w-2 h-2 rounded-full bg-indigo-400" />
                        )}
                      </div>

                      {/* Direction icon (for latest message) */}
                      <div className="pt-0.5 shrink-0">
                        {latestDir === 'agent_to_human' ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-[#7a7a8e] truncate">
                            {thread.participantAgents.join(', ')}
                          </span>
                          <span className="text-[10px] text-[#4a4a5e] shrink-0">
                            {formatRelativeTime(thread.latestMessage.timestamp)}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${thread.hasUnread ? 'text-[#e0e0e8] font-medium' : 'text-[#7a7a8e]'}`}>
                          {thread.rootSubject}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {messageCount > 1 && (
                            <span className="flex items-center gap-1 text-[10px] text-[#4a4a5e] bg-[#1a1a2e] rounded px-1.5 py-0.5">
                              <MessageSquare className="w-2.5 h-2.5" />
                              {messageCount}
                            </span>
                          )}
                          {thread.latestMessage.category && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${categoryColors[thread.latestMessage.category]?.bg || ''} ${categoryColors[thread.latestMessage.category]?.text || ''}`}>
                              {thread.latestMessage.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Thread detail or compose - hidden on mobile when showing list */}
        <div className={`flex-1 overflow-auto ${mobileShowDetail ? 'block' : 'hidden md:block'}`}>
          {composing ? (
            /* Compose form */
            <div className="p-4 md:p-6 max-w-2xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  {/* Mobile back button */}
                  <button
                    onClick={handleMobileBack}
                    className="md:hidden p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <h3 className="text-sm font-semibold text-[#e0e0e8]">
                    {replyToMessage ? `Reply to: ${normalizeSubject(replyToMessage.subject)}` : 'New Message'}
                  </h3>
                </div>
                <button
                  onClick={() => { setComposing(false); setReplyToMessage(null); setMobileShowDetail(false); }}
                  className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Prominent 'Replying to' card */}
                {replyToMessage && (
                  <div className="flex items-start gap-3 p-3 bg-indigo-500/5 border-l-2 border-indigo-400 rounded-r-lg">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      replyToMessage.direction === 'agent_to_human'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {replyToMessage.direction === 'agent_to_human' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Reply className="w-3 h-3 text-indigo-400" />
                        <span className="text-sm font-medium text-[#e0e0e8]">
                          Replying to {replyToMessage.direction === 'agent_to_human' ? replyToMessage.agentName : `You → ${replyToMessage.agentName}`}
                        </span>
                        <span className="text-[10px] text-[#4a4a5e]">
                          {formatRelativeTime(replyToMessage.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-[#7a7a8e] line-clamp-3 leading-relaxed">
                        {replyToMessage.body.slice(0, 320)}
                        {replyToMessage.body.length > 320 && '…'}
                      </p>
                    </div>
                    <button
                      onClick={() => setReplyToMessage(null)}
                      className="p-1 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded transition-all duration-150 shrink-0"
                      title="Clear reply target"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

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

                {/* File attachments */}
                <div>
                  <label className="block text-xs text-[#4a4a5e] mb-1.5">Attachments</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {pendingFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg text-sm"
                      >
                        {isImageFile(file.name) ? (
                          <Image className="w-3.5 h-3.5 text-indigo-400" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-[#7a7a8e]" />
                        )}
                        <span className="text-[#e0e0e8] max-w-[150px] truncate">{file.name}</span>
                        <span className="text-[#4a4a5e] text-xs">{formatFileSize(file.size)}</span>
                        <button
                          onClick={() => handleRemoveFile(idx)}
                          className="p-0.5 text-[#4a4a5e] hover:text-red-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-[#7a7a8e] hover:text-[#e0e0e8] border border-dashed border-[#2a2a4a] hover:border-indigo-500/50 rounded-lg cursor-pointer transition-all duration-200">
                    <Paperclip className="w-3.5 h-3.5" />
                    Add files
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      accept="image/*,.pdf,.txt,.md,.json,.csv"
                    />
                  </label>
                  <p className="mt-1 text-[10px] text-[#4a4a5e]">Max 5 files, 25MB each</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSend}
                    disabled={!composeAgentId || !composeSubject.trim() || !composeBody.trim() || sendMutation.isPending || isUploading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Uploading...
                      </>
                    ) : sendMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Send{pendingFiles.length > 0 && ` (${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''})`}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => { setComposing(false); setReplyToMessage(null); setPendingFiles([]); }}
                    className="px-4 py-2 text-sm text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : selectedThread ? (
            /* Thread detail view */
            <div className="p-4 md:p-6 max-w-2xl">
              {/* Thread header */}
              <div className="mb-6 pb-4 border-b border-[#1e1e3a]">
                <div className="flex items-center gap-3 mb-2">
                  {/* Mobile back button */}
                  <button
                    onClick={handleMobileBack}
                    className="md:hidden p-1.5 -ml-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <h3 className="text-base font-semibold text-[#e0e0e8]">{selectedThread.rootSubject}</h3>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#4a4a5e] md:ml-0 ml-7">
                  <span>{selectedThread.messages.length} message{selectedThread.messages.length !== 1 ? 's' : ''}</span>
                  <span>•</span>
                  <span>with {selectedThread.participantAgents.join(', ')}</span>
                </div>
              </div>

              {/* Messages in thread */}
              <div className="space-y-3">
                {selectedThread.messages.map((msg) => {
                  const isExpanded = expandedMessageId === msg.id;

                  return (
                    <div
                      key={msg.id}
                      className={`border border-[#1e1e3a] rounded-xl overflow-hidden transition-all duration-200 ${
                        isExpanded ? 'bg-[#0f0f18]' : 'bg-[#0a0a0f] hover:bg-[#0f0f18]'
                      }`}
                    >
                      {/* Collapsed header (always visible) */}
                      <button
                        onClick={() => setExpandedMessageId(isExpanded ? null : msg.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      >
                        {/* Expand icon */}
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-[#4a4a5e] shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-[#4a4a5e] shrink-0" />
                        )}

                        {/* Direction icon */}
                        {msg.direction === 'agent_to_human' ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        )}

                        {/* From/To and timestamp */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[#e0e0e8]">
                              {msg.direction === 'agent_to_human' ? msg.agentName : `You → ${msg.agentName}`}
                            </span>
                            {msg.category && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${categoryColors[msg.category]?.bg || ''} ${categoryColors[msg.category]?.text || ''}`}>
                                {msg.category}
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="text-xs text-[#4a4a5e] shrink-0">
                          {formatRelativeTime(msg.timestamp)}
                        </span>
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-[#1e1e3a]">
                          <div className="pl-7">
                            <div className="text-sm text-[#7a7a8e] mb-3">
                              <MarkdownContent text={msg.body} />
                            </div>

                            {/* Attachments */}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mb-3 flex flex-wrap gap-2">
                                {msg.attachments.map((att) => (
                                  <a
                                    key={att.id}
                                    href={getAttachmentUrl(att)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg text-sm hover:border-indigo-500/50 transition-colors"
                                  >
                                    {isImageFile(att.originalName) ? (
                                      <Image className="w-4 h-4 text-indigo-400" />
                                    ) : (
                                      <FileText className="w-4 h-4 text-[#7a7a8e]" />
                                    )}
                                    <span className="text-[#e0e0e8] max-w-[150px] truncate">{att.originalName}</span>
                                    <span className="text-[#4a4a5e] text-xs">{formatFileSize(att.size)}</span>
                                  </a>
                                ))}
                              </div>
                            )}

                            {/* Reply button (only for agent messages) */}
                            {msg.direction === 'agent_to_human' && (
                              <button
                                onClick={() => handleReply(msg)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 border border-[#1e1e3a] hover:bg-indigo-500/10 rounded-lg transition-all duration-200"
                              >
                                <Reply className="w-3 h-3" />
                                Reply
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quick reply at bottom */}
              <div className="mt-6 pt-4 border-t border-[#1e1e3a]">
                <button
                  onClick={() => handleReply(selectedThread.latestMessage)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-indigo-400 hover:text-indigo-300 border border-[#1e1e3a] hover:bg-indigo-500/10 rounded-xl transition-all duration-200"
                >
                  <Reply className="w-4 h-4" />
                  Reply to thread
                </button>
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Mail className="w-12 h-12 mx-auto mb-3 text-[#1e1e3a]" />
                <p className="text-[#4a4a5e] text-sm">Select a conversation to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
