import { createClient } from 'redis';

export class RedisMiddleware {
  constructor(config = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password,
      db: config.db || 0,
      ttl: config.ttl || 3600, // 1 hour default TTL
      ...config
    };
    
    this.client = null;
    this.connected = false;
  }

  async connect() {
    try {
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port
        },
        password: this.config.password,
        database: this.config.db
      });

      this.client.on('error', (err) => {
        console.error('Redis error:', err);
        this.connected = false;
      });

      this.client.on('connect', () => {
        console.log('📦 Redis connected');
        this.connected = true;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.connected = false;
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  // Smart cache key generation
  generateCacheKey(type, params) {
    const keyParts = [type];
    
    if (typeof params === 'object') {
      // Sort keys for consistent cache keys
      const sortedKeys = Object.keys(params).sort();
      for (const key of sortedKeys) {
        keyParts.push(`${key}:${params[key]}`);
      }
    } else {
      keyParts.push(params);
    }
    
    return keyParts.join(':');
  }

  async get(key) {
    if (!this.connected) return null;
    
    try {
      const value = await this.client.get(key);
      if (value) {
        console.log(`🎯 Cache HIT: ${key}`);
        return JSON.parse(value);
      }
      console.log(`❌ Cache MISS: ${key}`);
      return null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = null) {
    if (!this.connected) return false;
    
    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.config.ttl;
      
      await this.client.setEx(key, expiry, serialized);
      console.log(`💾 Cached: ${key} (TTL: ${expiry}s)`);
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  }

  async del(key) {
    if (!this.connected) return false;
    
    try {
      await this.client.del(key);
      console.log(`🗑️ Deleted: ${key}`);
      return true;
    } catch (error) {
      console.error('Redis delete error:', error);
      return false;
    }
  }

  // Pattern-based deletion (useful for clearing related cache)
  async delPattern(pattern) {
    if (!this.connected) return false;
    
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`🗑️ Deleted ${keys.length} keys matching: ${pattern}`);
      }
      return true;
    } catch (error) {
      console.error('Redis pattern delete error:', error);
      return false;
    }
  }

  // Session-specific helpers
  async getSession(sessionId) {
    return this.get(`session:${sessionId}`);
  }

  async setSession(sessionId, data, ttl = 86400) { // 24 hour default for sessions
    return this.set(`session:${sessionId}`, data, ttl);
  }

  async updateSession(sessionId, updates) {
    const existing = await this.getSession(sessionId) || {};
    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    return this.setSession(sessionId, merged);
  }

  // Dynatrace query caching helpers
  async cacheDynatraceQuery(query, result) {
    const key = this.generateCacheKey('dt:query', { query: query.substring(0, 100) });
    return this.set(key, result, 300); // 5 minute TTL for DT queries
  }

  async getCachedDynatraceQuery(query) {
    const key = this.generateCacheKey('dt:query', { query: query.substring(0, 100) });
    return this.get(key);
  }

  // Health check
  async ping() {
    if (!this.connected) return false;
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }
}
