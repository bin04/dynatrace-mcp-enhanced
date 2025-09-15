import { KnowledgeBase } from './knowledge-base.js';
import { OllamaClient } from './ollama-client.js';

export class ChatHandler {
  constructor({ redis, dynatraceConfig, ollamaConfig, mcpTools = null }) {
    this.redis = redis;
    this.dynatraceConfig = dynatraceConfig;
    this.ollamaConfig = ollamaConfig;
    
    // Initialize sub-components
    this.knowledgeBase = new KnowledgeBase();
    this.ollama = new OllamaClient(ollamaConfig);
    
    // Store reference to actual MCP tools
    this.mcpTools = mcpTools;
  }

  async handleMessage(message, sessionId) {
    try {
      // Determine the type of request and route accordingly
      const requestType = this.classifyRequest(message);
      console.log(`🧠 Request classified as: ${requestType}`);

      switch (requestType) {
        case 'dynatrace_query':
          return this.handleDynatraceQuery(message, sessionId);
        
        case 'knowledge_query':
          return this.handleKnowledgeQuery(message, sessionId);
        
        case 'ollama_chat':
          return this.handleOllamaChat(message, sessionId);
        
        case 'general_help':
          return this.handleGeneralHelp(message, sessionId);
        
        default:
          return this.handleDefault(message, sessionId);
      }
    } catch (error) {
      console.error('Chat handler error:', error);
      return this.formatErrorResponse(error);
    }
  }

  classifyRequest(message) {
    const msg = message.toLowerCase();
    console.log(`🔍 DEBUG: Classifying "${message}"`);

    // Dynatrace-specific queries
    if (msg.includes('dql') || msg.includes('fetch') || msg.includes('problems') || 
        msg.includes('vulnerabilities') || msg.includes('entities') || 
        msg.includes('logs') || msg.includes('metrics') || msg.includes('dynatrace')) {
      console.log(`🔍 DEBUG: -> dynatrace_query`);
      return 'dynatrace_query';
    }

    // General troubleshooting and observability questions
    if (msg.includes('troubleshoot') || msg.includes('investigate') || 
        msg.includes('correlate') || msg.includes('methodology')) {
      console.log(`🔍 DEBUG: -> knowledge_query`);
      return 'knowledge_query';
    }

    // General conversational queries (for Ollama)
    if (msg.includes('explain') || msg.includes('how do') || msg.includes('what is') ||
        msg.includes('help me') || msg.startsWith('can you')) {
      console.log(`🔍 DEBUG: -> ollama_chat`);
      return 'ollama_chat';
    }

    // Help and guidance
    if (msg.includes('help') || msg.includes('guide') || msg.includes('how to')) {
      console.log(`🔍 DEBUG: -> general_help`);
      return 'general_help';
    }

    console.log(`🔍 DEBUG: -> general_help (default)`);
    return 'general_help';
  }

  async handleDynatraceQuery(message, sessionId) {
    // Check cache first
    const cached = await this.redis.getCachedDynatraceQuery(message);
    if (cached) {
      return this.formatResponse(cached, 'cache', sessionId);
    }

    let result;
    
    try {
      console.log(`🔍 Attempting real Dynatrace query: ${message}`);
      
      // Create a simulated response that looks like we're calling real tools
      // but includes instructions on how to connect actual tools
      result = {
        message: `🔍 **Real Dynatrace Integration Needed**

Your query: "${message}"

**To get actual Dynatrace data, we need to connect the real MCP tools.**

**What you'd get with real connection:**
- Live problems from your Dynatrace environment
- Real DQL query execution  
- Actual vulnerability data
- Current system health status

**Quick test:** Try asking me \`show environment info\` to see if basic Dynatrace connection works.

**For now, here's what your query would typically return:**
- If "problems": Recent incidents and alerts
- If "vulnerabilities": Security issues requiring attention  
- If "logs": Application and infrastructure logs
- If DQL: Direct query results

💡 **Next step:** Connect this enhanced server to your existing Dynatrace MCP session.`,
        queryType: 'real_integration_needed',
        suggestion: 'Try: show environment info',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Dynatrace integration error:`, error);
      result = {
        message: `❌ **Dynatrace Integration Error**

Error: ${error.message}

**Fallback:** This enhanced server needs to be connected to your existing Dynatrace MCP session to provide real data.

**For now, you can:**
- Use the original Dynatrace MCP directly
- Ask general questions (routed to Ollama)
- Get troubleshooting guidance`,
        timestamp: new Date().toISOString()
      };
    }

    // Cache the result
    await this.redis.cacheDynatraceQuery(message, result);

    return this.formatResponse(result, 'integration_pending', sessionId);
  }

  async handleKnowledgeQuery(message, sessionId) {
    const knowledgeResponse = await this.knowledgeBase.query(message);
    return this.formatResponse(knowledgeResponse, 'knowledge', sessionId);
  }

  async handleOllamaChat(message, sessionId) {
    try {
      console.log(`🦙 Routing to Ollama: ${message}`);
      const ollamaResponse = await this.ollama.chat(message);
      return this.formatResponse(ollamaResponse, 'ollama', sessionId);
    } catch (error) {
      console.log(`🔄 Ollama unavailable (${error.message}), falling back to knowledge base`);
      return this.handleKnowledgeQuery(message, sessionId);
    }
  }

  async handleGeneralHelp(message, sessionId) {
    const helpResponse = this.generateHelpResponse(message);
    return this.formatResponse(helpResponse, 'help', sessionId);
  }

  async handleDefault(message, sessionId) {
    return this.handleGeneralHelp(message, sessionId);
  }

  extractDQLFromMessage(message) {
    // Extract DQL if explicitly provided
    const dqlMatch = message.match(/(?:dql|fetch)\s+(.+)/i);
    return dqlMatch ? dqlMatch[1] : null;
  }

  generateHelpResponse(message) {
    return {
      message: `👋 **Enhanced Dynatrace MCP Assistant**

**✅ Currently Working:**
🦙 **Ollama Integration** - Ask me to explain concepts
📊 **Knowledge Base** - General troubleshooting guidance  
📦 **Redis Caching** - Fast response times
💬 **Modern Chat UI** - This interface you're using

**🔧 Integration Needed:**
🔍 **Real Dynatrace Data** - Connect to your MCP session for live data

**Try these working features:**
- "explain microservices" → Ollama (Phi3)
- "troubleshooting methodology" → Knowledge base
- "how does kubernetes work" → Ollama
- "correlation strategies" → Knowledge base

**🎯 Test Dynatrace connection:**
- "show environment info" 
- "any current problems"

**Working great:** General explanations and troubleshooting guidance
**Next step:** Connect real Dynatrace MCP tools for live data`,
      suggestions: [
        "explain distributed systems",
        "how does observability work",
        "troubleshooting methodology",
        "what is kubernetes"
      ]
    };
  }

  formatResponse(content, source, sessionId) {
    const timestamp = new Date().toISOString();
    
    if (typeof content === 'string') {
      return `${content}\n\n_Source: ${source} | ${timestamp}_`;
    }
    
    if (content.message) {
      return `${content.message}\n\n_Source: ${source} | ${timestamp}_`;
    }
    
    return `${JSON.stringify(content, null, 2)}\n\n_Source: ${source} | ${timestamp}_`;
  }

  formatErrorResponse(error) {
    return `❌ **Error occurred**: ${error.message}

**What's working:**
- Ollama chat (explain, what is, how do)
- Knowledge base (troubleshooting, methodology)
- Redis caching

**Try:**
- "explain microservices"
- "troubleshooting methodology"

Need help? Try asking: "help"`;
  }
}
