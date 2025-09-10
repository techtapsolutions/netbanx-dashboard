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

// Circuit breaker states
enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, blocking requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

// Circuit breaker configuration
interface CircuitBreakerConfig {
  failureThreshold: number;     // Number of failures before opening
  recoveryTimeout: number;      // Time to wait before trying again (ms)
  monitoringPeriod: number;     // Time window for failure counting (ms)
  successThreshold: number;     // Successes needed to close from half-open
}

// Circuit breaker implementation for Redis operations
class RedisCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker OPEN: Redis temporarily unavailable');
      }
      // Transition to half-open to test recovery
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        console.log('🟢 Redis circuit breaker: CLOSED (recovered)');
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in normal operation
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery test, go back to OPEN
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
      console.log('🔴 Redis circuit breaker: OPEN (recovery failed)');
    } else if (this.state === CircuitState.CLOSED && 
               this.failureCount >= this.config.failureThreshold) {
      // Too many failures, open the circuit
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
      console.log(`🔴 Redis circuit breaker: OPEN (${this.failureCount} failures)`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    console.log('🔄 Redis circuit breaker: RESET');
  }
}

// Connection pool health monitoring
interface ConnectionHealth {
  isHealthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  averageLatency: number;
  errorRate: number;
}

// Production Redis connection factory
export class RedisConnectionManager {
  private static instance: Redis | UpstashRedis | null = null;
  private static useUpstash = false;
  private static circuitBreaker: RedisCircuitBreaker;
  private static connectionHealth: ConnectionHealth = {
    isHealthy: true,
    lastCheck: 0,
    consecutiveFailures: 0,
    averageLatency: 0,
    errorRate: 0
  };
  private static latencyHistory: number[] = [];
  private static healthCheckInterval: NodeJS.Timeout | null = null;

  // Initialize circuit breaker with production-optimized settings
  static {
    const circuitConfig: CircuitBreakerConfig = {
      failureThreshold: parseInt(process.env.REDIS_CIRCUIT_FAILURE_THRESHOLD || '5'),
      recoveryTimeout: parseInt(process.env.REDIS_CIRCUIT_RECOVERY_TIMEOUT || '30000'), // 30 seconds
      monitoringPeriod: parseInt(process.env.REDIS_CIRCUIT_MONITORING_PERIOD || '60000'), // 1 minute
      successThreshold: parseInt(process.env.REDIS_CIRCUIT_SUCCESS_THRESHOLD || '3')
    };
    
    this.circuitBreaker = new RedisCircuitBreaker(circuitConfig);
    this.startHealthMonitoring();
  }

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
   * Start automated health monitoring for Redis connections
   */
  private static startHealthMonitoring(): void {
    if (process.env.NODE_ENV === 'production') {
      this.healthCheckInterval = setInterval(async () => {
        await this.performHealthCheck();
      }, parseInt(process.env.REDIS_HEALTH_CHECK_INTERVAL || '30000')); // 30 seconds
    }
  }

  /**
   * Perform comprehensive health check
   */
  private static async performHealthCheck(): Promise<void> {
    try {
      const startTime = Date.now();
      await this.circuitBreaker.execute(async () => {
        const redis = this.getInstance();
        if (this.useUpstash) {
          await (redis as UpstashRedis).ping();
        } else {
          await (redis as Redis).ping();
        }
      });

      const latency = Date.now() - startTime;
      this.updateConnectionHealth(true, latency);
    } catch (error) {
      console.warn('Redis health check failed:', error);
      this.updateConnectionHealth(false, 0);
    }
  }

  /**
   * Update connection health metrics
   */
  private static updateConnectionHealth(success: boolean, latency: number): void {
    this.connectionHealth.lastCheck = Date.now();
    
    if (success) {
      this.connectionHealth.consecutiveFailures = 0;
      this.connectionHealth.isHealthy = true;
      
      // Track latency for averages
      this.latencyHistory.push(latency);
      if (this.latencyHistory.length > 100) {
        this.latencyHistory.shift(); // Keep only last 100 measurements
      }
      
      this.connectionHealth.averageLatency = 
        this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    } else {
      this.connectionHealth.consecutiveFailures++;
      if (this.connectionHealth.consecutiveFailures >= 3) {
        this.connectionHealth.isHealthy = false;
      }
    }
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
   * Universal Redis operations adapter with circuit breaker protection
   * Provides consistent interface for both IORedis and Upstash
   */
  static async get(key: string): Promise<string | null> {
    return await this.circuitBreaker.execute(async () => {
      const redis = this.getInstance();
      return this.useUpstash 
        ? await (redis as UpstashRedis).get(key)
        : await (redis as Redis).get(key);
    });
  }

  static async set(key: string, value: string, ttl?: number): Promise<string | null> {
    return await this.circuitBreaker.execute(async () => {
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
    });
  }

  static async setex(key: string, seconds: number, value: string): Promise<string | null> {
    return await this.circuitBreaker.execute(async () => {
      const redis = this.getInstance();
      return this.useUpstash
        ? await (redis as UpstashRedis).setex(key, seconds, value)
        : await (redis as Redis).setex(key, seconds, value);
    });
  }

  static async del(...keys: string[]): Promise<number> {
    return await this.circuitBreaker.execute(async () => {
      const redis = this.getInstance();
      return this.useUpstash
        ? await (redis as UpstashRedis).del(...keys)
        : await (redis as Redis).del(...keys);
    });
  }

  static async exists(...keys: string[]): Promise<number> {
    return await this.circuitBreaker.execute(async () => {
      const redis = this.getInstance();
      return this.useUpstash
        ? await (redis as UpstashRedis).exists(...keys)
        : await (redis as Redis).exists(...keys);
    });
  }

  static async keys(pattern: string): Promise<string[]> {
    return await this.circuitBreaker.execute(async () => {
      const redis = this.getInstance();
      return this.useUpstash
        ? await (redis as UpstashRedis).keys(pattern)
        : await (redis as Redis).keys(pattern);
    });
  }

  static async ping(): Promise<string> {
    return await this.circuitBreaker.execute(async () => {
      const redis = this.getInstance();
      return this.useUpstash
        ? await (redis as UpstashRedis).ping()
        : await (redis as Redis).ping();
    });
  }

  /**
   * Batch operations with pipeline support (IORedis only)
   */
  static async pipeline(operations: Array<[string, ...any[]]>): Promise<any[]> {
    if (this.useUpstash) {
      throw new Error('Pipeline operations not supported with Upstash REST API');
    }

    return await this.circuitBreaker.execute(async () => {
      const redis = this.getInstance() as Redis;
      const pipeline = redis.pipeline();
      
      operations.forEach(([command, ...args]) => {
        (pipeline as any)[command](...args);
      });
      
      return await pipeline.exec();
    });
  }

  // Advanced operations for IORedis only (Bull.js compatibility)
  static getIORedisInstance(): Redis {
    if (this.useUpstash) {
      throw new Error('IORedis operations not available with Upstash REST API. Use UPSTASH_REDIS_URL for Bull.js compatibility.');
    }
    return this.getInstance() as Redis;
  }

  /**
   * Get comprehensive connection status and circuit breaker stats
   */
  static getConnectionStatus() {
    return {
      ...this.connectionHealth,
      circuitBreaker: this.circuitBreaker.getStats(),
      provider: this.useUpstash ? 'upstash' : 'redis',
      environmentOptimized: process.env.NODE_ENV === 'production'
    };
  }

  /**
   * Force circuit breaker reset (emergency use only)
   */
  static resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    this.connectionHealth = {
      isHealthy: true,
      lastCheck: 0,
      consecutiveFailures: 0,
      averageLatency: 0,
      errorRate: 0
    };
    this.latencyHistory = [];
  }

  /**
   * Graceful shutdown with health monitoring cleanup
   */
  static async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    await this.closeConnection();
  }

  /**
   * Safe operation execution with fallback handling
   */
  static async safeExecute<T>(
    operation: () => Promise<T>, 
    fallback?: T,
    operationName?: string
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      console.warn(`Redis operation ${operationName || 'unknown'} failed:`, error);
      
      // If circuit breaker is open, return fallback immediately
      if (error instanceof Error && error.message.includes('Circuit breaker OPEN')) {
        console.log(`Returning fallback for ${operationName} due to circuit breaker`);
        return fallback !== undefined ? fallback : null;
      }
      
      // For other errors, still return fallback if provided
      return fallback !== undefined ? fallback : null;
    }
  }

  /**
   * Warm up Redis connection for better first-request performance
   */
  static async warmUpConnection(): Promise<void> {
    try {
      console.log('🔥 Warming up Redis connection...');
      const startTime = Date.now();
      
      await this.ping();
      await this.set('warmup:test', 'connection-test', 5);
      await this.get('warmup:test');
      await this.del('warmup:test');
      
      const warmupTime = Date.now() - startTime;
      console.log(`✅ Redis connection warmed up in ${warmupTime}ms`);
    } catch (error) {
      console.warn('⚠️ Redis warmup failed:', error);
    }
  }
}

// Export singleton instance for backward compatibility
export const redis = RedisConnectionManager.getInstance();

// Export utilities with enhanced monitoring
export const redisHealth = RedisConnectionManager.getHealthStats;
export const redisTest = RedisConnectionManager.testConnection;
export const redisStatus = RedisConnectionManager.getConnectionStatus;
export const redisWarmup = RedisConnectionManager.warmUpConnection;
export const redisSafeExecute = RedisConnectionManager.safeExecute;

// Export circuit breaker controls
export const resetRedisCircuitBreaker = RedisConnectionManager.resetCircuitBreaker;

// Export enhanced Redis operations
export const redisGet = RedisConnectionManager.get;
export const redisSet = RedisConnectionManager.set;
export const redisSetex = RedisConnectionManager.setex;
export const redisDel = RedisConnectionManager.del;
export const redisExists = RedisConnectionManager.exists;
export const redisKeys = RedisConnectionManager.keys;
export const redisPing = RedisConnectionManager.ping;
export const redisPipeline = RedisConnectionManager.pipeline;

// Export types for external use
export type { ConnectionHealth, CircuitBreakerConfig };
export { CircuitState };