import { db } from './database';

export class SessionCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_SESSIONS_PER_USER = 5; // Maximum concurrent sessions per user

  // Start the cleanup service
  start() {
    if (this.cleanupInterval) {
      return; // Already running
    }

    // Run cleanup immediately
    this.cleanup();

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);

    console.log('Session cleanup service started');
  }

  // Stop the cleanup service
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('Session cleanup service stopped');
    }
  }

  // Perform cleanup
  private async cleanup() {
    try {
      // 1. Remove expired sessions
      const expiredResult = await this.removeExpiredSessions();
      
      // 2. Remove orphaned sessions (users that no longer exist or are inactive)
      const orphanedResult = await this.removeOrphanedSessions();
      
      // 3. Limit sessions per user
      const limitResult = await this.limitSessionsPerUser();
      
      // 4. Log cleanup statistics
      await this.logCleanupStats({
        expired: expiredResult,
        orphaned: orphanedResult,
        limited: limitResult,
      });

      console.log(`Session cleanup completed: ${expiredResult} expired, ${orphanedResult} orphaned, ${limitResult} over-limit sessions removed`);
    } catch (error) {
      console.error('Session cleanup failed:', error);
    }
  }

  // Remove expired sessions
  private async removeExpiredSessions(): Promise<number> {
    try {
      const result = await db.session.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      return result.count;
    } catch (error) {
      console.error('Failed to remove expired sessions:', error);
      return 0;
    }
  }

  // Remove sessions for inactive or deleted users
  private async removeOrphanedSessions(): Promise<number> {
    try {
      // Find sessions for inactive users
      const inactiveSessions = await db.session.findMany({
        where: {
          user: {
            isActive: false,
          },
        },
        select: {
          id: true,
        },
      });

      if (inactiveSessions.length === 0) {
        return 0;
      }

      // Delete these sessions
      const result = await db.session.deleteMany({
        where: {
          id: {
            in: inactiveSessions.map(s => s.id),
          },
        },
      });

      return result.count;
    } catch (error) {
      console.error('Failed to remove orphaned sessions:', error);
      return 0;
    }
  }

  // Limit the number of sessions per user
  private async limitSessionsPerUser(): Promise<number> {
    try {
      // Get users with too many sessions
      const usersWithExcessSessions = await db.user.findMany({
        where: {
          sessions: {
            some: {},
          },
        },
        select: {
          id: true,
          sessions: {
            orderBy: {
              createdAt: 'desc',
            },
            select: {
              id: true,
            },
          },
        },
      });

      let totalRemoved = 0;

      for (const user of usersWithExcessSessions) {
        if (user.sessions.length > this.MAX_SESSIONS_PER_USER) {
          // Keep the newest sessions, remove the oldest
          const sessionsToRemove = user.sessions
            .slice(this.MAX_SESSIONS_PER_USER)
            .map(s => s.id);

          if (sessionsToRemove.length > 0) {
            const result = await db.session.deleteMany({
              where: {
                id: {
                  in: sessionsToRemove,
                },
              },
            });

            totalRemoved += result.count;
          }
        }
      }

      return totalRemoved;
    } catch (error) {
      console.error('Failed to limit sessions per user:', error);
      return 0;
    }
  }

  // Log cleanup statistics
  private async logCleanupStats(stats: {
    expired: number;
    orphaned: number;
    limited: number;
  }) {
    try {
      // Get current session statistics
      const totalSessions = await db.session.count();
      const activeSessions = await db.session.count({
        where: {
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      // Log to audit log
      await db.auditLog.create({
        data: {
          action: 'SESSION_CLEANUP',
          resource: 'SESSION',
          details: {
            ...stats,
            totalSessions,
            activeSessions,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      console.error('Failed to log cleanup stats:', error);
    }
  }

  // Validate a specific session
  static async validateSession(token: string): Promise<boolean> {
    try {
      const session = await db.session.findUnique({
        where: { token },
        include: {
          user: {
            select: {
              isActive: true,
            },
          },
        },
      });

      if (!session) {
        return false;
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        // Remove expired session
        await db.session.delete({
          where: { token },
        });
        return false;
      }

      // Check if user is still active
      if (!session.user.isActive) {
        // Remove session for inactive user
        await db.session.delete({
          where: { token },
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }

  // Extend session expiration (for sliding sessions)
  static async extendSession(token: string, extensionMs: number = 24 * 60 * 60 * 1000): Promise<boolean> {
    try {
      const newExpiresAt = new Date(Date.now() + extensionMs);

      const result = await db.session.update({
        where: { token },
        data: {
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        },
      });

      return !!result;
    } catch (error) {
      console.error('Failed to extend session:', error);
      return false;
    }
  }

  // Get session info
  static async getSessionInfo(token: string) {
    try {
      const session = await db.session.findUnique({
        where: { token },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              companyId: true,
              isActive: true,
            },
          },
        },
      });

      if (!session || session.expiresAt < new Date() || !session.user.isActive) {
        return null;
      }

      return {
        token: session.token,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        user: session.user,
      };
    } catch (error) {
      console.error('Failed to get session info:', error);
      return null;
    }
  }
}

// Create singleton instance
export const sessionCleanup = new SessionCleanupService();