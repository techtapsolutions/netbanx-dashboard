// Stub queue service without Bull dependency for Next.js compatibility
// This replaces the Bull-based queue system with simple direct processing

export class QueueService {
  // Synchronously process webhook (no queue)
  static async processWebhook(webhookData: any, metadata: any = {}) {
    // This would normally add to a queue, but now processes directly
    const { WebhookProcessor } = await import('./webhook-processor');
    const processor = new WebhookProcessor();
    
    return await processor.processWebhook(webhookData, {
      ...metadata,
      processedAt: new Date().toISOString(),
    });
  }

  // Return stub stats
  static async getQueueStats() {
    return {
      webhook: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Stub methods for compatibility
  static async pauseQueue() {
    console.log('Queue paused (stub implementation)');
  }

  static async resumeQueue() {
    console.log('Queue resumed (stub implementation)');
  }
}

// For compatibility, also export as QueueManager
export const QueueManager = QueueService;

// Stub initialization
export async function initializeQueues() {
  console.log('Queues initialized (stub implementation)');
}

// Stub shutdown
export async function shutdownQueues() {
  console.log('Queues shut down (stub implementation)');
}

// Export webhook queue stub
export const webhookQueue = {
  add: async () => ({ id: 'stub-job' }),
  process: () => {},
  on: () => {},
};