import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  Loader2,
  X,
  Edit3,
  ChevronDown,
  ChevronRight,
  Zap,
  Calendar,
  Timer,
  RotateCcw,
  User,
  Bot,
} from 'lucide-react';
import type { Agent, CronJob, Schedule } from '../types/agent';
import {
  listCronJobs,
  createCronJob,
  updateCronJob,
  deleteCronJob,
  triggerCronJob,
  getCronHistory,
} from '../api/agents';
import { ConfirmModal } from './ConfirmModal';

// Collapsible section wrapper (same pattern as SettingsTab)
function Section({
  title,
  icon: Icon,
  children,
  defaultExpanded = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-[#1e1e3a] rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-6 py-4 bg-[#12121a] hover:bg-[#1a1a2e]/50 transition-all duration-200 text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[#4a4a5e]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[#4a4a5e]" />
        )}
        <Icon className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-semibold text-[#e0e0e8]">{title}</span>
      </button>
      {expanded && <div className="p-6 bg-[#0a0a0f]">{children}</div>}
    </div>
  );
}

// Helpers

function formatSchedule(schedule: Schedule): string {
  switch (schedule.kind) {
    case 'cron':
      return `Cron: ${schedule.expression}${schedule.timezone ? ` (${schedule.timezone})` : ''}`;
    case 'at':
      return `Once at: ${new Date(schedule.datetime).toLocaleString()}`;
    case 'every': {
      const ms = schedule.intervalMs;
      if (ms < 60_000) return `Every ${Math.round(ms / 1000)} seconds`;
      if (ms < 3_600_000) {
        const mins = Math.round(ms / 60_000);
        return `Every ${mins} minute${mins !== 1 ? 's' : ''}`;
      }
      if (ms < 86_400_000) {
        const hours = Math.round(ms / 3_600_000);
        return `Every ${hours} hour${hours !== 1 ? 's' : ''}`;
      }
      const days = Math.round(ms / 86_400_000);
      return `Every ${days} day${days !== 1 ? 's' : ''}`;
    }
  }
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) {
    const absDiff = Math.abs(diffMs);
    if (absDiff < 60_000) return `in ${Math.round(absDiff / 1000)}s`;
    if (absDiff < 3_600_000) return `in ${Math.round(absDiff / 60_000)} min`;
    if (absDiff < 86_400_000) return `in ${Math.round(absDiff / 3_600_000)} hour${Math.round(absDiff / 3_600_000) !== 1 ? 's' : ''}`;
    return `in ${Math.round(absDiff / 86_400_000)} day${Math.round(absDiff / 86_400_000) !== 1 ? 's' : ''}`;
  }

  if (diffMs < 60_000) return `${Math.round(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)} min ago`;
  if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)} hour${Math.round(diffMs / 3_600_000) !== 1 ? 's' : ''} ago`;
  return `${Math.round(diffMs / 86_400_000)} day${Math.round(diffMs / 86_400_000) !== 1 ? 's' : ''} ago`;
}

function scheduleIcon(schedule: Schedule) {
  switch (schedule.kind) {
    case 'cron':
      return Clock;
    case 'at':
      return Calendar;
    case 'every':
      return Timer;
  }
}

// CronJobModal component
function CronJobModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
  job,
  mode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; schedule: Schedule; message: string }) => void;
  isSaving: boolean;
  job?: CronJob | null;
  mode: 'create' | 'edit';
}) {
  const [name, setName] = useState('');
  const [scheduleKind, setScheduleKind] = useState<'cron' | 'at' | 'every'>('cron');
  const [cronExpression, setCronExpression] = useState('');
  const [timezone, setTimezone] = useState('');
  const [atDatetime, setAtDatetime] = useState('');
  const [everyMinutes, setEveryMinutes] = useState(5);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (job && mode === 'edit') {
      setName(job.name);
      setMessage(job.message);
      setScheduleKind(job.schedule.kind);
      if (job.schedule.kind === 'cron') {
        setCronExpression(job.schedule.expression);
        setTimezone(job.schedule.timezone || '');
      } else if (job.schedule.kind === 'at') {
        // Convert ISO string to datetime-local format
        const dt = new Date(job.schedule.datetime);
        const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16);
        setAtDatetime(local);
      } else if (job.schedule.kind === 'every') {
        setEveryMinutes(Math.round(job.schedule.intervalMs / 60_000));
      }
    } else {
      setName('');
      setScheduleKind('cron');
      setCronExpression('');
      setTimezone('');
      setAtDatetime('');
      setEveryMinutes(5);
      setMessage('');
    }
  }, [job, mode, isOpen]);

  if (!isOpen) return null;

  const buildSchedule = (): Schedule => {
    switch (scheduleKind) {
      case 'cron':
        return { kind: 'cron', expression: cronExpression, ...(timezone ? { timezone } : {}) };
      case 'at':
        return { kind: 'at', datetime: new Date(atDatetime).toISOString() };
      case 'every':
        return { kind: 'every', intervalMs: everyMinutes * 60_000 };
    }
  };

  const canSubmit = () => {
    if (!name.trim() || !message.trim()) return false;
    if (scheduleKind === 'cron' && !cronExpression.trim()) return false;
    if (scheduleKind === 'at' && !atDatetime) return false;
    if (scheduleKind === 'every' && everyMinutes < 1) return false;
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#12121a] border border-[#1e1e3a] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e3a]">
          <h3 className="text-sm font-semibold text-[#e0e0e8]">
            {mode === 'create' ? 'Create Scheduled Job' : `Edit: ${job?.name}`}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ name, schedule: buildSchedule(), message });
          }}
          className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]"
        >
          {/* Name */}
          <div>
            <label className="block text-xs text-[#7a7a8e] mb-1.5">Job Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., daily-report"
              className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          {/* Schedule Type Selector */}
          <div>
            <label className="block text-xs text-[#7a7a8e] mb-2">Schedule Type</label>
            <div className="flex gap-2">
              {([
                { kind: 'cron' as const, label: 'Cron', icon: Clock },
                { kind: 'at' as const, label: 'One-time', icon: Calendar },
                { kind: 'every' as const, label: 'Interval', icon: Timer },
              ]).map(({ kind, label, icon: KindIcon }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setScheduleKind(kind)}
                  className={`flex items-center gap-2 px-4 py-2 text-xs rounded-xl border transition-all duration-200 ${
                    scheduleKind === kind
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                      : 'border-[#1e1e3a] text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e]'
                  }`}
                >
                  <KindIcon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Value - changes based on type */}
          {scheduleKind === 'cron' && (
            <>
              <div>
                <label className="block text-xs text-[#7a7a8e] mb-1.5">Cron Expression</label>
                <input
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 9 * * *"
                  className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm font-mono focus:outline-none focus:border-indigo-500"
                  required
                />
                <p className="text-xs text-[#4a4a5e] mt-1">e.g. 0 9 * * * (daily at 9am)</p>
              </div>
              <div>
                <label className="block text-xs text-[#7a7a8e] mb-1.5">Timezone (optional)</label>
                <input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="America/New_York"
                  className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}

          {scheduleKind === 'at' && (
            <div>
              <label className="block text-xs text-[#7a7a8e] mb-1.5">Date & Time</label>
              <input
                type="datetime-local"
                value={atDatetime}
                onChange={(e) => setAtDatetime(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
          )}

          {scheduleKind === 'every' && (
            <div>
              <label className="block text-xs text-[#7a7a8e] mb-1.5">Interval (minutes)</label>
              <input
                type="number"
                min="1"
                value={everyMinutes}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1) setEveryMinutes(v);
                }}
                className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
          )}

          {/* Message */}
          <div>
            <label className="block text-xs text-[#7a7a8e] mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="The message to send to the agent when this job triggers..."
              className="w-full h-32 px-4 py-3 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm resize-y focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1e1e3a]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl text-sm transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !canSubmit()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Main CronTab component

interface CronTabProps {
  agent: Agent;
}

export function CronTab({ agent }: CronTabProps) {
  const queryClient = useQueryClient();

  // State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);

  // Queries
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['cron-jobs', agent.id],
    queryFn: () => listCronJobs(agent.id),
    refetchInterval: 30000,
  });

  const { data: history } = useQuery({
    queryKey: ['cron-history', agent.id],
    queryFn: () => getCronHistory(agent.id),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { name: string; schedule: Schedule; message: string }) =>
      createCronJob(agent.id, { ...data, createdBy: 'user' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-jobs', agent.id] });
      setModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      jobId,
      data,
    }: {
      jobId: string;
      data: Partial<{ name: string; schedule: Schedule; message: string; enabled: boolean }>;
    }) => updateCronJob(agent.id, jobId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-jobs', agent.id] });
      setModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => deleteCronJob(agent.id, jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-jobs', agent.id] });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: (jobId: string) => triggerCronJob(agent.id, jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-jobs', agent.id] });
      queryClient.invalidateQueries({ queryKey: ['cron-history', agent.id] });
    },
  });

  const handleSave = (data: { name: string; schedule: Schedule; message: string }) => {
    if (modalMode === 'create') {
      createMutation.mutate(data);
    } else if (selectedJob) {
      updateMutation.mutate({ jobId: selectedJob.id, data });
    }
  };

  const handleEdit = (job: CronJob) => {
    setSelectedJob(job);
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedJob(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const jobsList = jobs || [];
  const historyList = (history || []).slice(0, 20);

  // Build job name lookup for history
  const jobNameMap = new Map<string, string>();
  for (const job of jobsList) {
    jobNameMap.set(job.id, job.name);
  }

  const statusColor = (status: string) => {
    if (status === 'enqueued') return 'text-emerald-400 bg-emerald-500/10';
    if (status.startsWith('skipped')) return 'text-yellow-400 bg-yellow-500/10';
    return 'text-red-400 bg-red-500/10';
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0f]">
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        {/* Scheduled Jobs */}
        <Section title="Scheduled Jobs" icon={Clock}>
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#7a7a8e]">
                {jobsList.length} job{jobsList.length !== 1 ? 's' : ''} configured
              </span>
              <button
                onClick={handleCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-xl hover:bg-indigo-500 transition-all duration-200"
              >
                <Plus className="w-3.5 h-3.5" />
                Create
              </button>
            </div>

            {/* Job list or empty state */}
            {jobsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            ) : jobsList.length === 0 ? (
              <div className="text-center py-12 text-[#4a4a5e] text-sm">
                No scheduled jobs configured
              </div>
            ) : (
              <div className="space-y-3">
                {jobsList.map((job) => {
                  const ScheduleIcon = scheduleIcon(job.schedule);
                  return (
                    <div
                      key={job.id}
                      className="group flex items-center gap-4 p-4 bg-[#12121a] border border-[#1e1e3a] rounded-xl"
                    >
                      {/* Left: schedule icon */}
                      <div className="shrink-0">
                        <ScheduleIcon className="w-5 h-5 text-indigo-400" />
                      </div>

                      {/* Middle: info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {/* Enabled dot */}
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              job.enabled ? 'bg-emerald-400' : 'bg-[#4a4a5e]'
                            }`}
                          />
                          <span className="text-sm font-medium text-[#e0e0e8] truncate">
                            {job.name}
                          </span>
                          {/* Run count badge */}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1a1a2e] text-[#7a7a8e] shrink-0">
                            {job.runCount} run{job.runCount !== 1 ? 's' : ''}
                          </span>
                          {/* Created-by badge */}
                          <span className="shrink-0" title={`Created by ${job.createdBy}`}>
                            {job.createdBy === 'user' ? (
                              <User className="w-3 h-3 text-[#4a4a5e]" />
                            ) : (
                              <Bot className="w-3 h-3 text-[#4a4a5e]" />
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-[#7a7a8e] mt-1">
                          {formatSchedule(job.schedule)}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-[#4a4a5e]">
                          {job.lastRunAt && (
                            <span>
                              Last: {formatRelativeTime(job.lastRunAt)}
                              {job.lastRunStatus && (
                                <span
                                  className={`ml-1 ${
                                    job.lastRunStatus === 'success'
                                      ? 'text-emerald-400'
                                      : job.lastRunStatus === 'failed'
                                      ? 'text-red-400'
                                      : 'text-yellow-400'
                                  }`}
                                >
                                  ({job.lastRunStatus})
                                </span>
                              )}
                            </span>
                          )}
                          {job.nextRunAt && (
                            <span>Next: {formatRelativeTime(job.nextRunAt)}</span>
                          )}
                        </div>
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Enable/Disable toggle */}
                        <button
                          onClick={() =>
                            updateMutation.mutate({
                              jobId: job.id,
                              data: { enabled: !job.enabled },
                            })
                          }
                          className={`p-1.5 rounded-lg transition-all duration-200 ${
                            job.enabled
                              ? 'text-emerald-400 hover:bg-emerald-500/10'
                              : 'text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e]'
                          }`}
                          title={job.enabled ? 'Pause job' : 'Enable job'}
                        >
                          {job.enabled ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => handleEdit(job)}
                          className="p-1.5 text-[#4a4a5e] hover:text-indigo-400 hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
                          title="Edit job"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Trigger now */}
                        <button
                          onClick={() => triggerMutation.mutate(job.id)}
                          disabled={triggerMutation.isPending}
                          className="p-1.5 text-[#4a4a5e] hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-all duration-200"
                          title="Trigger now"
                        >
                          <Zap className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setDeleteJobId(job.id)}
                          className="p-1.5 text-[#4a4a5e] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200"
                          title="Delete job"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Section>

        {/* Run History */}
        <Section title="Run History" icon={RotateCcw} defaultExpanded={false}>
          {historyList.length === 0 ? (
            <div className="text-center py-8 text-[#4a4a5e] text-sm">No run history yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e1e3a]">
                    <th className="text-left py-2 px-3 text-[#4a4a5e] font-medium">Time</th>
                    <th className="text-left py-2 px-3 text-[#4a4a5e] font-medium">Job</th>
                    <th className="text-left py-2 px-3 text-[#4a4a5e] font-medium">Status</th>
                    <th className="text-left py-2 px-3 text-[#4a4a5e] font-medium">Message ID</th>
                    <th className="text-left py-2 px-3 text-[#4a4a5e] font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map((record, idx) => (
                    <tr
                      key={`${record.jobId}-${record.timestamp}-${idx}`}
                      className="border-b border-[#1e1e3a]/50"
                    >
                      <td className="py-2 px-3 text-[#7a7a8e] whitespace-nowrap">
                        {formatRelativeTime(record.timestamp)}
                      </td>
                      <td className="py-2 px-3 text-[#e0e0e8]">
                        {jobNameMap.get(record.jobId) || record.jobId.slice(0, 8)}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(
                            record.status
                          )}`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[#7a7a8e] font-mono">
                        {record.messageId ? record.messageId.slice(0, 12) + '...' : '-'}
                      </td>
                      <td className="py-2 px-3 text-red-400 max-w-[200px] truncate">
                        {record.error || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <CronJobModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        isSaving={createMutation.isPending || updateMutation.isPending}
        job={selectedJob}
        mode={modalMode}
      />

      <ConfirmModal
        isOpen={!!deleteJobId}
        onClose={() => setDeleteJobId(null)}
        onConfirm={() => {
          if (deleteJobId) {
            deleteMutation.mutate(deleteJobId);
          }
          setDeleteJobId(null);
        }}
        title="Delete Scheduled Job"
        message="Are you sure you want to delete this scheduled job? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
