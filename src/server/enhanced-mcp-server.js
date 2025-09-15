import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Our enhanced components
import { RedisMiddleware } from './redis-middleware.js';
import { SessionManager } from './session-manager.js';
import { ChatHandler } from '../integrations/chat-handler.js';
import { KnowledgeBase } from '../integrations/knowledge-base.js';

// Load environment config
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class EnhancedMCPServer {
  constructor(config = {}) {
    this.config = {
      port: process.env.PORT || 3000,
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined
      },
      dynatrace: {
        environment: process.env.DT_ENVIRONMENT,
        oauthClientId: process.env.OAUTH_CLIENT_ID,
        oauthClientSecret: process.env.OAUTH_CLIENT_SECRET
      },
      ollama: {
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'llama2'
      },
      cache: {
        ttl: parseInt(process.env.CACHE_TTL) || 3600,
        sessionTtl: parseInt(process.env.SESSION_TTL) || 86400
      },
      ...config
    };

    this.app = express();
    this.server = createServer(this.app);
    
    // Will be initialized in start()
    this.redis = null;
    this.sessions = null;
    this.chatHandler = null;
    this.adtKnowledge = null;
  }

  async initializeComponents() {
    console.log('🔧 Initializing Enhanced MCP components...');
    
    // Initialize our enhanced components
    this.redis = new RedisMiddleware(this.config.redis);
    this.sessions = new SessionManager(this.redis);
    this.chatHandler = new ChatHandler({
      redis: this.redis,
      dynatraceConfig: this.config.dynatrace,
      ollamaConfig: this.config.ollama
    });
    this.adtKnowledge = new KnowledgeBase();

    // Connect to Redis
    const redisConnected = await this.redis.connect();
    if (redisConnected) {
      console.log('✅ Redis connected successfully');
    } else {
      console.log('⚠️ Redis connection failed - continuing without cache');
    }

    // Validate Dynatrace config
    if (this.config.dynatrace.environment && this.config.dynatrace.oauthClientId) {
      console.log(`✅ Dynatrace config loaded: ${this.config.dynatrace.environment}`);
    } else {
      console.log('⚠️ Dynatrace OAuth config incomplete - some features may be limited');
    }

    console.log('✅ Enhanced MCP components initialized');
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.static(path.join(__dirname, '../ui/public')));
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check with detailed status
    this.app.get('/health', async (req, res) => {
      const health = {
        status: 'healthy',
        service: 'Dynatrace MCP Enhanced',
        timestamp: new Date().toISOString(),
        components: {
          redis: this.redis?.connected || false,
          dynatrace: !!this.config.dynatrace.environment,
          ollama: 'checking...'
        },
        config: {
          dynatraceEnv: this.config.dynatrace.environment ? 
            this.config.dynatrace.environment.replace(/https?:\/\//, '') : 'not configured',
          redisHost: `${this.config.redis.host}:${this.config.redis.port}`,
          ollamaUrl: this.config.ollama.baseUrl
        }
      };

      // Quick Ollama health check
      try {
        const ollamaStatus = await this.chatHandler.ollama.checkHealth();
        health.components.ollama = ollamaStatus;
      } catch (error) {
        health.components.ollama = false;
      }

      res.json(health);
    });

    // Chat endpoint with enhanced error handling
    this.app.post('/chat', async (req, res) => {
      try {
        const { message, session_id } = req.body;
        
        if (!message || typeof message !== 'string') {
          return res.status(400).json({ 
            error: 'Message is required and must be a string',
            example: { message: "Show me recent problems", session_id: "optional" }
          });
        }

        const sessionId = session_id || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`💬 Processing message from session ${sessionId}: ${message.substring(0, 100)}...`);
        
        const startTime = Date.now();
        const response = await this.chatHandler.handleMessage(message, sessionId);
        const processingTime = Date.now() - startTime;

        // Update session with the interaction
        if (this.sessions && this.redis?.connected) {
          await this.sessions.addMessage(sessionId, message, response);
        }

        res.json({
          response,
          session_id: sessionId,
          timestamp: new Date().toISOString(),
          processing_time_ms: processingTime
        });

      } catch (error) {
        console.error('💥 Chat error:', error);
        res.status(500).json({ 
          error: 'Internal server error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Session info endpoint
    this.app.get('/session/:sessionId', async (req, res) => {
      try {
        if (!this.sessions || !this.redis?.connected) {
          return res.status(503).json({ error: 'Session management unavailable' });
        }

        const sessionId = req.params.sessionId;
        const session = await this.sessions.getSession(sessionId);
        const stats = await this.sessions.getSessionStats(sessionId);

        res.json({
          session,
          stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Session info error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // API info endpoint  
    this.app.get('/api/info', (req, res) => {
      res.json({
        name: 'Dynatrace MCP Enhanced',
        version: '1.0.0',
        description: 'Enhanced Dynatrace MCP with Redis caching, chat UI, and Ollama integration',
        features: [
          'Redis Caching & Session Management',
          'Modern Chat Interface', 
          'Ollama Integration',
          'ADT Enterprise Knowledge Base',
          'Dynatrace OAuth Integration'
        ],
        endpoints: {
          '/': 'Chat UI',
          '/health': 'Detailed health check',
          '/chat': 'POST - Chat with enhanced MCP',
          '/session/:id': 'GET - Session information',
          '/api/info': 'API information'
        },
        config: {
          dynatrace: !!this.config.dynatrace.environment,
          redis: this.redis?.connected || false,
          ollama: this.config.ollama.baseUrl
        }
      });
    });

    // Serve the chat UI at root
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../ui/public/index.html'));
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        available_endpoints: ['/', '/health', '/chat', '/api/info']
      });
    });
  }

  async start() {
    try {
      await this.initializeComponents();
      this.setupMiddleware();
      this.setupRoutes();
      
      this.server.listen(this.config.port, () => {
        console.log('\n🚀 Dynatrace MCP Enhanced Server Started!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📱 Chat UI:        http://localhost:${this.config.port}`);
        console.log(`🔍 Health Check:   http://localhost:${this.config.port}/health`);
        console.log(`📊 API Info:       http://localhost:${this.config.port}/api/info`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🔧 Dynatrace:      ${this.config.dynatrace.environment || 'Not configured'}`);
        console.log(`📦 Redis:          ${this.config.redis.host}:${this.config.redis.port}`);
        console.log(`🦙 Ollama:         ${this.config.ollama.baseUrl}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      });

    } catch (error) {
      console.error('💥 Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop() {
    console.log('\n🛑 Shutting down gracefully...');
    if (this.redis) {
      await this.redis.disconnect();
      console.log('✅ Redis disconnected');
    }
    this.server.close(() => {
      console.log('✅ Server stopped');
    });
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new EnhancedMCPServer();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
  
  server.start().catch(console.error);
}

export { EnhancedMCPServer };
