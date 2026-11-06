import { purgeExpiredMessages } from './retention';

async function main() {
  console.log('[CRON PURGE] Starting standalone retention purge...');
  try {
    const result = await purgeExpiredMessages();
    console.log(
      `[CRON PURGE] Completed successfully. Deleted ${result.deletedCount} message(s) older than ${result.cutoffDate}`
    );
    process.exit(0);
  } catch (err) {
    console.error('[CRON PURGE] Failed:', err);
    process.exit(1);
  }
}

main();

