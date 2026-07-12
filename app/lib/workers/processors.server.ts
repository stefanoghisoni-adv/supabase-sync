// Processor stubs - implemented in Tasks 9-11
import type { Job } from 'bullmq';
import type { SyncJobData } from '../queue/queues.server';

/**
 * Process periodic sync check for a shop
 * Task 9: Implement periodic sync checking logic
 */
export async function processPeriodicSyncCheck(shopId: string): Promise<void> {
  throw new Error('processPeriodicSyncCheck not yet implemented (Task 9)');
}

/**
 * Process initial bulk sync for a shop
 * Task 10: Implement initial bulk sync logic
 */
export async function processInitialBulkSync(shopId: string, job: Job<any>): Promise<void> {
  throw new Error('processInitialBulkSync not yet implemented (Task 10)');
}

/**
 * Process manual sync for a shop
 * Task 10: Implement manual sync logic
 */
export async function processManualSync(shopId: string, job: Job<any>): Promise<void> {
  throw new Error('processManualSync not yet implemented (Task 10)');
}

/**
 * Process retry of failed webhook
 * Task 11: Implement webhook retry logic
 */
export async function processRetryWebhook(data: Extract<SyncJobData, { type: 'retry-failed-webhook' }>): Promise<void> {
  throw new Error('processRetryWebhook not yet implemented (Task 11)');
}
