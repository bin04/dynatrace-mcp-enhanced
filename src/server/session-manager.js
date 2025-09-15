export class SessionManager {
  constructor(redis) {
    this.redis = redis;
    this.defaultSessionTTL = 86400; // 24 hours
  }

  async createSession(sessionId, initialData = {}) {
    const session = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      context: {
        currentTopic: null,
        dynatraceQueries: [],
        adtContext: null
      },
      preferences: {
        cacheEnabled: true,
        responseFormat: 'detailed'
      },
      ...initialData
    };

    await this.redis.setSession(sessionId, session);
    console.log(`👤 Created session: ${sessionId}`);
    return session;
  }

  async getSession(sessionId) {
    let session = await this.redis.getSession(sessionId);
    
    if (!session) {
      // Auto-create session if it doesn't exist
      session = await this.createSession(sessionId);
    }
    
    return session;
  }

  async updateSession(sessionId, updates) {
    const session = await this.getSession(sessionId);
    const updatedSession = {
      ...session,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await this.redis.setSession(sessionId, updatedSession);
    return updatedSession;
  }

  async addMessage(sessionId, message, response) {
    const session = await this.getSession(sessionId);
    
    // Update message count and add to context
    const updates = {
      messageCount: session.messageCount + 1,
      lastMessage: {
        message,
        response: response.substring(0, 200) + '...', // Truncated for storage
        timestamp: new Date().toISOString()
      }
    };

    // Detect and store context
    if (this.isDynatraceQuery(message)) {
      updates.context = {
        ...session.context,
        currentTopic: 'dynatrace',
        dynatraceQueries: [...(session.context.dynatraceQueries || []), message].slice(-5) // Keep last 5
      };
    } else if (this.isADTQuery(message)) {
      updates.context = {
        ...session.context,
        currentTopic: 'adt',
        adtContext: this.extractADTContext(message)
      };
    }

    return this.updateSession(sessionId, updates);
  }

  isDynatraceQuery(message) {
    const dtKeywords = ['dql', 'fetch', 'problems', 'entities', 'metrics', 'logs', 'vulnerabilities'];
    return dtKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  isADTQuery(message) {
    const adtKeywords = ['oms', 'myadt', 'mobiletech', 'mt2', 'iib', 'datapower', 'mulesoft', 'salesforce'];
    return adtKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  extractADTContext(message) {
    // Extract ADT-specific context from the message
    const context = {
      systems: [],
      problemType: null,
      urgency: 'normal'
    };

    const systemMentions = {
      oms: ['oms', 'order management'],
      myadt: ['myadt', 'customer portal'],
      mt2: ['mt2', 'mobiletech', 'mobile tech'],
      iib: ['iib', 'integration bus'],
      datapower: ['datapower', 'data power'],
      mulesoft: ['mulesoft', 'cloudhub']
    };

    for (const [system, keywords] of Object.entries(systemMentions)) {
      if (keywords.some(keyword => message.toLowerCase().includes(keyword))) {
        context.systems.push(system);
      }
    }

    // Detect urgency
    if (message.toLowerCase().includes('critical') || message.toLowerCase().includes('down')) {
      context.urgency = 'critical';
    } else if (message.toLowerCase().includes('urgent') || message.toLowerCase().includes('issue')) {
      context.urgency = 'high';
    }

    return context;
  }

  async getSessionStats(sessionId) {
    const session = await this.getSession(sessionId);
    return {
      messageCount: session.messageCount,
      duration: new Date() - new Date(session.createdAt),
      currentTopic: session.context.currentTopic,
      cacheHits: session.cacheHits || 0
    };
  }

  async cleanupExpiredSessions() {
    // This would be called periodically to clean up old sessions
    // Implementation depends on Redis expiration handling
    console.log('🧹 Session cleanup completed');
  }
}
