import { NextRequest, NextResponse } from 'next/server';
import { WebhookQueueManager } from '@/lib/webhook-queue';

/**
 * @swagger
 * /api/webhooks/queue:
 *   get:
 *     summary: Get webhook queue statistics and status
 *     description: Monitor webhook processing queue performance and health
 *     responses:
 *       200:
 *         description: Queue statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 queue:
 *                   type: object
 *                   properties:
 *                     waiting:
 *                       type: integer
 *                       description: Jobs waiting to be processed
 *                     active:
 *                       type: integer  
 *                       description: Jobs currently being processed
 *                     completed:
 *                       type: integer
 *                       description: Successfully completed jobs
 *                     failed:
 *                       type: integer
 *                       description: Failed jobs
 *                     delayed:
 *                       type: integer
 *                       description: Jobs scheduled for later processing
 *                     total:
 *                       type: integer
 *                       description: Total jobs in queue
 */
export async function GET(request: NextRequest) {
  try {
    const queueStats = await WebhookQueueManager.getQueueStats();
    
    return NextResponse.json({
      success: true,
      queue: queueStats,
      processing: 'async',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get queue stats:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to retrieve queue statistics',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/webhooks/queue:
 *   post:
 *     summary: Manage webhook queue operations
 *     description: Pause, resume, or clean the webhook queue
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [pause, resume, clean, stats]
 *                 description: Action to perform on the queue
 *             required:
 *               - action
 *     responses:
 *       200:
 *         description: Operation successful
 *       400:
 *         description: Invalid action specified
 *       500:
 *         description: Operation failed
 */
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        { error: 'Action is required and must be a string' },
        { status: 400 }
      );
    }

    switch (action.toLowerCase()) {
      case 'pause':
        await WebhookQueueManager.pauseQueue();
        return NextResponse.json({
          success: true,
          message: 'Queue paused successfully',
          action: 'pause',
        });

      case 'resume':
        await WebhookQueueManager.resumeQueue();
        return NextResponse.json({
          success: true,
          message: 'Queue resumed successfully',
          action: 'resume',
        });

      case 'clean':
        await WebhookQueueManager.cleanQueue();
        return NextResponse.json({
          success: true,
          message: 'Queue cleaned successfully',
          action: 'clean',
        });

      case 'stats':
        const stats = await WebhookQueueManager.getQueueStats();
        return NextResponse.json({
          success: true,
          queue: stats,
          action: 'stats',
        });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Valid actions: pause, resume, clean, stats` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Queue management error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Queue operation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}