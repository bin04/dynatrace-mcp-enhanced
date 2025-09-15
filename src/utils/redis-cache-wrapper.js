// redis-cache-wrapper.js - Simple caching wrapper for MCP functions
require('dotenv').config();
const Redis = require('ioredis');
const crypto = require('crypto');

class MCPCacheWrapper {
  constructor() {
    this.redis = null;
    this.enabled = process.env.REDIS_ENABLED === 'true';
    this.defaultTTL = parseInt(process.env.REDIS_TTL_SECONDS || '300');

    if (this.enabled) {
      this.initRedis();
    }
  }

  initRedis() {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: parseInt(process.env.REDIS_DB || '0'),
        password: process.env.REDIS_PASSWORD || undefined,
        lazyConnect: true,
      });

      this.redis.on('error', (err) => {
        console.warn('Redis error (continuing without cache):', err.message);
      });

      console.log('✅ Redis cache enabled for MCP functions');
    } catch (error) {
      console.warn('Redis init failed (continuing without cache):', error.message);
      this.redis = null;
    }
  }

  // Generate cache key from function name and parameters
  generateKey(functionName, params = {}) {
    const paramStr = JSON.stringify(params);
    const hash = crypto.createHash('sha256').update(paramStr).digest('hex').substring(0, 12);
    return `mcp:${functionName}:${hash}`;
  }

  // Cached wrapper for any MCP function
  async withCache(functionName, originalFunction, params = {}, ttl = null) {
    // If Redis is disabled or not available, just call the original function
    if (!this.enabled || !this.redis) {
      console.log(`🔄 ${functionName} (no cache)`);
      return await originalFunction(params);
    }

    const cacheKey = this.generateKey(functionName, params);
    const cacheTTL = ttl || this.defaultTTL;

    try {
      // Try to get from cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        console.log(`⚡ ${functionName} (cached)`);
        return JSON.parse(cached);
      }

      // Not in cache, call original function
      console.log(`🔄 ${functionName} (fetching)`);
      const result = await originalFunction(params);

      // Cache the result
      await this.redis.setex(cacheKey, cacheTTL, JSON.stringify(result));
      console.log(`💾 ${functionName} (cached for ${cacheTTL}s)`);

      return result;
    } catch (error) {
      console.warn(`Cache error for ${functionName}:`, error.message);
      // Fall back to original function
      return await originalFunction(params);
    }
  }

  // Specific helpers for common Dynatrace operations
  async cachedDQL(originalFunction, dqlStatement, ttl = 300) {
    return await this.withCache('execute_dql', originalFunction, { dqlStatement }, ttl);
  }

  async cachedProblems(originalFunction, filters = {}, ttl = 180) {
    return await this.withCache('list_problems', originalFunction, filters, ttl);
  }

  async cachedVulnerabilities(originalFunction, filters = {}, ttl = 600) {
    return await this.withCache('list_vulnerabilities', originalFunction, filters, ttl);
  }

  async cachedEntityDetails(originalFunction, entityId, ttl = 1800) {
    return await this.withCache('get_entity_details', originalFunction, { entityId }, ttl);
  }

  // Session storage for conversation context
  async storeSession(sessionId, data) {
    if (!this.enabled || !this.redis) return false;

    try {
      const key = `session:${sessionId}`;
      await this.redis.hset(key, 'data', JSON.stringify(data));
      await this.redis.hset(key, 'updated', new Date().toISOString());
      await this.redis.expire(key, 3600); // 1 hour for sessions
      return true;
    } catch (error) {
      console.warn('Session store error:', error.message);
      return false;
    }
  }

  async getSession(sessionId) {
    if (!this.enabled || !this.redis) return null;

    try {
      const key = `session:${sessionId}`;
      const sessionData = await this.redis.hget(key, 'data');
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      console.warn('Session get error:', error.message);
      return null;
    }
  }

  // Clear cache for specific function or pattern
  async clearCache(pattern = 'mcp:*') {
    if (!this.enabled || !this.redis) return;

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`🗑️  Cleared ${keys.length} cache entries`);
      }
    } catch (error) {
      console.warn('Cache clear error:', error.message);
    }
  }

  async disconnect() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// Export singleton instance
module.exports = new MCPCacheWrapper();
