import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

// Redis connection configuration interface
interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
  keepAlive?: boolean;
  connectTimeout?: number;
  commandTimeout?: number;
  family?: 4 | 6;
}

// Production Redis connection factory
export class RedisConnectionManager {
  private static instance: Redis | UpstashRedis | null = null;
  private static useUpstash = false;

  /**
   * Get Redis instance - automatically detects production vs development
   */
  static getInstance(): Redis | UpstashRedis {
    if (!this.instance) {
      this.instance = this.createConnection();
    }
    return this.instance;
  }

  /**
   * Create appropriate Redis connection based on environment
   */
  private static createConnection(): Redis | UpstashRedis {
    // Check for Upstash configuration (production)
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const upstashRedisUrl = process.env.UPSTASH_REDIS_URL;

    // Priority 1: Upstash REST API (most reliable for serverless)
    if (upstashUrl && upstashToken) {
      console.log('🚀 Using Upstash Redis REST API for production');
      this.useUpstash = true;
      
      return new UpstashRedis({
        url: upstashUrl,
        token: upstashToken,
        retry: {
          retries: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
          backoff: (retryCount) => 
            Math.min(1000 * Math.pow(2, retryCount), 5000)
        }
      });
    }

    // Priority 2: Upstash Redis Protocol URL
    if (upstashRedisUrl) {
      console.log('🚀 Using Upstash Redis Protocol for production');
      return this.createIORedisConnection(upstashRedisUrl);
    }

    // Priority 3: Standard Redis URL (production or development)
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      console.log(`🔗 Using Redis URL: ${redisUrl.replace(/(:\/\/.*:)(.*)(@)/, '$1****$3')}`);
      return this.createIORedisConnection(redisUrl);
    }

    // Priority 4: Individual parameters (development fallback)
    console.log('🛠️ Using Redis with individual parameters (development)');
    return this.createIORedisConnection();
  }

  /**
   * Create IORedis connection with optimized configuration
   */
  private static createIORedisConnection(connectionUrl?: string): Redis {
    const baseConfig: RedisConfig = {
      // Production-optimized timeouts
      connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT || '5000'),
      commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '3000'),
      
      // Connection reliability
      maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
      retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100'),
      enableReadyCheck: false, // Better for serverless
      lazyConnect: true,       // Connect on first command
      keepAlive: process.env.REDIS_KEEPALIVE !== 'false',
      family: 4, // IPv4 for better compatibility
    };

    if (connectionUrl) {
      return new Redis(connectionUrl, baseConfig);
    }

    // Individual parameter configuration
    const config: RedisConfig = {
      ...baseConfig,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
    };

    return new Redis(config);
  }

  /**
   * Test Redis connection
   */
  static async testConnection(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
    provider: 'upstash-rest' | 'upstash-redis' | 'redis';
    version?: string;
  }> {
    try {
      const startTime = Date.now();
      const redis = this.getInstance();

      if (this.useUpstash) {
        // Test Upstash REST API
        await (redis as UpstashRedis).ping();
        const latency = Date.now() - startTime;
        
        return {
          success: true,
          latency,
          provider: 'upstash-rest',
        };
      } else {
        // Test IORedis connection
        const ioRedis = redis as Redis;
        await ioRedis.ping();
        const info = await ioRedis.info('server');
        const latency = Date.now() - startTime;
        
        // Extract Redis version
        const versionMatch = info.match(/redis_version:([^\r\n]*)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';
        
        const provider = process.env.UPSTASH_REDIS_URL ? 'upstash-redis' : 'redis';
        
        return {
          success: true,
          latency,
          provider,
          version,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown connection error',
        provider: this.useUpstash ? 'upstash-rest' : 'redis',
      };
    }
  }

  /**
   * Get Redis connection health stats
   */
  static async getHealthStats(): Promise<{
    connected: boolean;
    uptime?: number;
    usedMemory?: string;
    connectedClients?: number;
    commandsProcessed?: number;
    provider: string;
  }> {
    try {
      const redis = this.getInstance();
      
      if (this.useUpstash) {
        // Upstash REST API doesn't provide detailed stats
        const ping = await (redis as UpstashRedis).ping();
        return {
          connected: ping === 'PONG',
          provider: 'upstash-rest',
        };
      } else {
        // IORedis detailed stats
        const ioRedis = redis as Redis;
        const info = await ioRedis.info();
        
        // Parse server info
        const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);
        const memoryMatch = info.match(/used_memory_human:([^\r\n]*)/);
        const clientsMatch = info.match(/connected_clients:(\d+)/);
        const commandsMatch = info.match(/total_commands_processed:(\d+)/);
        
        return {
          connected: true,
          uptime: uptimeMatch ? parseInt(uptimeMatch[1]) : undefined,
          usedMemory: memoryMatch ? memoryMatch[1] : undefined,
          connectedClients: clientsMatch ? parseInt(clientsMatch[1]) : undefined,
          commandsProcessed: commandsMatch ? parseInt(commandsMatch[1]) : undefined,
          provider: process.env.UPSTASH_REDIS_URL ? 'upstash-redis' : 'redis',
        };
      }
    } catch (error) {
      return {
        connected: false,
        provider: this.useUpstash ? 'upstash-rest' : 'redis',
      };
    }
  }

  /**
   * Gracefully close Redis connection
   */
  static async closeConnection(): Promise<void> {
    if (this.instance && !this.useUpstash) {
      try {
        await (this.instance as Redis).quit();
        console.log('✅ Redis connection closed gracefully');
      } catch (error) {
        console.warn('⚠️ Error closing Redis connection:', error);
      }
    }
    this.instance = null;
  }

  /**
   * Universal Redis operations adapter
   * Provides consistent interface for both IORedis and Upstash
   */
  static async get(key: string): Promise<string | null> {
    const redis = this.getInstance();
    return this.useUpstash 
      ? await (redis as UpstashRedis).get(key)
      : await (redis as Redis).get(key);
  }

  static async set(key: string, value: string, ttl?: number): Promise<string | null> {
    const redis = this.getInstance();
    if (this.useUpstash) {
      return ttl 
        ? await (redis as UpstashRedis).setex(key, ttl, value)
        : await (redis as UpstashRedis).set(key, value);
    } else {
      return ttl
        ? await (redis as Redis).setex(key, ttl, value)
        : await (redis as Redis).set(key, value);
    }
  }

  static async setex(key: string, seconds: number, value: string): Promise<string | null> {
    const redis = this.getInstance();
    return this.useUpstash
      ? await (redis as UpstashRedis).setex(key, seconds, value)
      : await (redis as Redis).setex(key, seconds, value);
  }

  static async del(...keys: string[]): Promise<number> {
    const redis = this.getInstance();
    return this.useUpstash
      ? await (redis as UpstashRedis).del(...keys)
      : await (redis as Redis).del(...keys);
  }

  static async exists(...keys: string[]): Promise<number> {
    const redis = this.getInstance();
    return this.useUpstash
      ? await (redis as UpstashRedis).exists(...keys)
      : await (redis as Redis).exists(...keys);
  }

  static async keys(pattern: string): Promise<string[]> {
    const redis = this.getInstance();
    return this.useUpstash
      ? await (redis as UpstashRedis).keys(pattern)
      : await (redis as Redis).keys(pattern);
  }

  static async ping(): Promise<string> {
    const redis = this.getInstance();
    return this.useUpstash
      ? await (redis as UpstashRedis).ping()
      : await (redis as Redis).ping();
  }

  // Advanced operations for IORedis only (Bull.js compatibility)
  static getIORedisInstance(): Redis {
    if (this.useUpstash) {
      throw new Error('IORedis operations not available with Upstash REST API. Use UPSTASH_REDIS_URL for Bull.js compatibility.');
    }
    return this.getInstance() as Redis;
  }
}

// Export singleton instance for backward compatibility
export const redis = RedisConnectionManager.getInstance();

// Export utilities
export const redisHealth = RedisConnectionManager.getHealthStats;
export const redisTest = RedisConnectionManager.testConnection;