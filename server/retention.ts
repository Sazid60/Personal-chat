import { dbAsync } from './database';

export const RETENTION_DAYS = 7;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface PurgeResult {
  deletedCount: number;
  cutoffTimestamp: number;
  cutoffDate: string;
  durationMs: number;
}

/**
 * Purges all messages older than 7 days from the SQLite database.
 * Reclaims disk space immediately using SQLite incremental vacuum.
 */
export async function purgeExpiredMessages(): Promise<PurgeResult> {
  const startTime = Date.now();
  const cutoffTimestamp = Date.now() - RETENTION_MS;
  const cutoffDate = new Date(cutoffTimestamp).toISOString();

  try {
    const result = await dbAsync.run(
      'DELETE FROM messages WHERE created_at < ?',
      [cutoffTimestamp]
    );

    try {
      await dbAsync.run('PRAGMA incremental_vacuum');
    } catch (_) {}

    const durationMs = Date.now() - startTime;
    console.log(
      `[RETENTION CRON] Purged ${result.changes} expired message(s) older than ${cutoffDate} (${durationMs}ms)`
    );

    return {
      deletedCount: result.changes,
      cutoffTimestamp,
      cutoffDate,
      durationMs
    };
  } catch (error) {
    console.error('[RETENTION CRON] Error executing purge:', error);
    throw error;
  }
}

/**
 * Initializes automatic in-process daily retention cron.
 * Runs on boot (recovers from platform restarts/sleeps) and repeats every 24h.
 */
export function initRetentionCron(): NodeJS.Timeout {
  // Cold-boot cleanup
  purgeExpiredMessages().catch((err) =>
    console.error('[RETENTION CRON] Cold-boot cleanup error:', err)
  );

  // Daily interval (24 hours)
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    purgeExpiredMessages().catch((err) =>
      console.error('[RETENTION CRON] Daily scheduled purge error:', err)
    );
  }, TWENTY_FOUR_HOURS);

  timer.unref();
  return timer;
}

