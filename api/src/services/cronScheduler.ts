import { Cron } from 'croner';
import { listAllCronJobs, getCronJob, updateCronJob, recordCronRun } from './cron.js';
import { enqueueMessage } from './agents.js';
import { notifyNewMessage } from './queueConsumer.js';
import type { CronJob, Schedule } from '../types.js';

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface ScheduledEntry {
  cancel: () => void;
}

const scheduledJobs: Map<string, ScheduledEntry> = new Map();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the scheduler at API startup.
 * Loads all persisted cron jobs and schedules the enabled ones.
 */
export async function initScheduler(): Promise<void> {
  try {
    const jobs = await listAllCronJobs();
    let scheduled = 0;

    for (const job of jobs) {
      if (!job.enabled) continue;

      // Clean up expired one-shot (`at`) jobs whose datetime is in the past
      if (job.schedule.kind === 'at') {
        const fireTime = new Date(job.schedule.datetime).getTime();
        if (fireTime <= Date.now()) {
          await updateCronJob(job.id, { enabled: false });
          console.log(`[Scheduler] Disabled expired at-job "${job.name}" (${job.id.slice(0, 8)})`);
          continue;
        }
      }

      scheduleJob(job);
      scheduled++;
    }

    console.log(`[Scheduler] Initialized ${scheduled} cron jobs`);
  } catch (err) {
    console.error('[Scheduler] Failed to initialize:', err);
  }
}

/**
 * Create a timer / Cron instance for the given job and store it in memory.
 */
export function scheduleJob(job: CronJob): void {
  // Unschedule first if already present (idempotent)
  if (scheduledJobs.has(job.id)) {
    unscheduleJob(job.id);
  }

  const schedule: Schedule = job.schedule;

  try {
    if (schedule.kind === 'cron') {
      const cronInstance = new Cron(
        schedule.expression,
        { timezone: schedule.timezone ?? 'UTC', paused: false },
        () => { executeJob(job.id); },
      );

      scheduledJobs.set(job.id, {
        cancel: () => { cronInstance.stop(); },
      });
    } else if (schedule.kind === 'at') {
      const delay = new Date(schedule.datetime).getTime() - Date.now();
      if (delay > 0) {
        const timer = setTimeout(() => { executeJob(job.id); }, delay);
        scheduledJobs.set(job.id, {
          cancel: () => { clearTimeout(timer); },
        });
      } else {
        // Already past — nothing to schedule
        return;
      }
    } else if (schedule.kind === 'every') {
      const timer = setInterval(() => { executeJob(job.id); }, schedule.intervalMs);
      scheduledJobs.set(job.id, {
        cancel: () => { clearInterval(timer); },
      });
    }

    console.log(`[Scheduler] Scheduled job "${job.name}" (${job.id.slice(0, 8)})`);
  } catch (err) {
    console.error(
      `[Scheduler] Failed to schedule job "${job.name}" (${job.id.slice(0, 8)}):`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Stop and remove a scheduled job from the in-memory map.
 */
export function unscheduleJob(jobId: string): void {
  const entry = scheduledJobs.get(jobId);
  if (entry) {
    entry.cancel();
    scheduledJobs.delete(jobId);
  }
}

/**
 * Convenience helper: unschedule then re-schedule a job.
 */
export function rescheduleJob(job: CronJob): void {
  unscheduleJob(job.id);
  if (job.enabled) {
    scheduleJob(job);
  }
}

/**
 * Compute the approximate next run time for a job.
 * Returns an ISO-8601 string or undefined if not applicable.
 */
export function getNextRunTime(job: CronJob): string | undefined {
  if (!job.enabled) return undefined;

  const schedule: Schedule = job.schedule;

  if (schedule.kind === 'cron') {
    try {
      const temp = new Cron(schedule.expression, {
        timezone: schedule.timezone ?? 'UTC',
        paused: true,
      });
      const next = temp.nextRun();
      temp.stop();
      return next ? next.toISOString() : undefined;
    } catch {
      return undefined;
    }
  }

  if (schedule.kind === 'at') {
    const dt = new Date(schedule.datetime);
    return dt.getTime() > Date.now() ? dt.toISOString() : undefined;
  }

  if (schedule.kind === 'every') {
    // Approximate: next fire is ~intervalMs from now
    return new Date(Date.now() + schedule.intervalMs).toISOString();
  }

  return undefined;
}

/**
 * Graceful shutdown — cancel every scheduled entry.
 */
export function stopScheduler(): void {
  for (const [jobId, entry] of scheduledJobs) {
    entry.cancel();
    scheduledJobs.delete(jobId);
  }
  console.log('[Scheduler] Stopped — all jobs cancelled');
}

// ---------------------------------------------------------------------------
// Job execution
// ---------------------------------------------------------------------------

/**
 * Called when a timer/Cron fires. Re-reads the job from storage, enqueues the
 * message for the target agent, and records the run in history.
 */
export async function executeJob(jobId: string): Promise<void> {
  const now = new Date().toISOString();

  try {
    // Re-read from storage to get the freshest state
    const job = await getCronJob(jobId);

    if (!job || !job.enabled) {
      console.log(`[Scheduler] Job ${jobId.slice(0, 8)} skipped (not found or disabled)`);
      if (job) {
        await recordCronRun({
          jobId,
          agentId: job.agentId,
          timestamp: now,
          status: 'skipped_disabled',
        });
      }
      return;
    }

    // Enqueue the message for the agent
    const msg = await enqueueMessage(
      job.agentId,
      job.message,
      'system',
      { cronJobId: job.id, cronJobName: job.name, triggerType: 'cron' },
    );

    // Kick the queue consumer so it picks up the new message
    await notifyNewMessage(job.agentId);

    // Update job metadata
    await updateCronJob(jobId, {
      lastRunAt: now,
      lastRunStatus: 'success',
      runCount: job.runCount + 1,
    });

    // Record the run in history
    await recordCronRun({
      jobId,
      agentId: job.agentId,
      timestamp: now,
      status: 'enqueued',
      messageId: msg.id,
    });

    console.log(`[Scheduler] Executed job "${job.name}" (${jobId.slice(0, 8)}) -> message ${msg.id.slice(0, 8)}`);

    // One-shot `at` jobs auto-disable after firing
    if (job.schedule.kind === 'at') {
      await updateCronJob(jobId, { enabled: false });
      unscheduleJob(jobId);
      console.log(`[Scheduler] Auto-disabled at-job "${job.name}" (${jobId.slice(0, 8)})`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Scheduler] Error executing job ${jobId.slice(0, 8)}:`, errorMessage);

    try {
      const job = await getCronJob(jobId);
      if (job) {
        await updateCronJob(jobId, {
          lastRunAt: now,
          lastRunStatus: 'failed',
        });
        await recordCronRun({
          jobId,
          agentId: job.agentId,
          timestamp: now,
          status: 'error',
          error: errorMessage,
        });
      }
    } catch (recordErr) {
      console.error(`[Scheduler] Failed to record error for job ${jobId.slice(0, 8)}:`, recordErr);
    }
  }
}
