import { KnowledgeBase } from './knowledge-base.js';
import { OllamaClient } from './ollama-client.js';

export class ChatHandler {
  constructor({ redis, dynatraceConfig, ollamaConfig }) {
    this.redis = redis;
    this.dynatraceConfig = dynatraceConfig;
    this.ollamaConfig = ollamaConfig;
    
    // Initialize sub-components
    this.knowledgeBase = new KnowledgeBase();
    this.ollama = new OllamaClient(ollamaConfig);
    
    // MCP tools will be available through the MCP server context
    this.mcpTools = null;
  }

  // Method to inject MCP tools from the server context
  setMCPTools(tools) {
    this.mcpTools = tools;
    console.log('✅ MCP tools injected into chat handler');
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

    // Dynatrace-specific queries
    if (msg.includes('dql') || msg.includes('fetch') || msg.includes('problems') || 
        msg.includes('vulnerabilities') || msg.includes('entities') || 
        msg.includes('logs') || msg.includes('metrics')) {
      return 'dynatrace_query';
    }

    // General troubleshooting and observability questions
    if (msg.includes('troubleshoot') || msg.includes('investigate') || 
        msg.includes('correlate') || msg.includes('methodology')) {
      return 'knowledge_query';
    }

    // General conversational queries (for Ollama)
    if (msg.includes('explain') || msg.includes('how do') || msg.includes('what is') ||
        msg.includes('help me') || msg.startsWith('can you')) {
      return 'ollama_chat';
    }

    // Help and guidance
    if (msg.includes('help') || msg.includes('guide') || msg.includes('how to')) {
      return 'general_help';
    }

    return 'general_help';
  }

  async handleDynatraceQuery(message, sessionId) {
    // Check cache first
    const cached = await this.redis.getCachedDynatraceQuery(message);
    if (cached) {
      return this.formatResponse(cached, 'cache', sessionId);
    }

    // For now, simulate Dynatrace query handling
    // TODO: Integrate with actual MCP tools when available
    const result = {
      message: `🔍 **Dynatrace Query Processing**

Your query: "${message}"

This would typically:
1. Parse your natural language query
2. Generate appropriate DQL if needed
3. Execute against Dynatrace environment
4. Cache and return results

**Available query types:**
- "Show recent problems" → \`fetch dt.davis.problems\`
- "List vulnerabilities" → \`fetch dt.security_problems\`
- "Get logs from last hour" → \`fetch logs\`
- "Show service entities" → \`fetch dt.entity.service\`

💡 **Try a specific DQL query like:** \`fetch dt.davis.problems | limit 10\``,
      queryType: this.extractDQLFromMessage(message) ? 'dql' : 'natural_language',
      timestamp: new Date().toISOString()
    };

    // Cache the result
    await this.redis.cacheDynatraceQuery(message, result);

    return this.formatResponse(result, 'dynatrace_sim', sessionId);
  }

  async handleKnowledgeQuery(message, sessionId) {
    const knowledgeResponse = await this.knowledgeBase.query(message);
    return this.formatResponse(knowledgeResponse, 'knowledge', sessionId);
  }

  async handleOllamaChat(message, sessionId) {
    try {
      const ollamaResponse = await this.ollama.chat(message);
      return this.formatResponse(ollamaResponse, 'ollama', sessionId);
    } catch (error) {
      // Fallback to knowledge base if Ollama fails
      console.log('🔄 Ollama unavailable, falling back to knowledge base');
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

I can help with:

🔍 **Dynatrace Queries**
- "Show me recent problems"
- "fetch logs from last hour" 
- "list vulnerabilities"
- "get service entities"

📊 **Troubleshooting Guidance**  
- "How to investigate performance issues"
- "Troubleshooting methodology"
- "Correlation strategies"

💬 **General Chat** (via Ollama)
- Ask me to explain concepts
- Get observability guidance
- Learn about best practices

🚀 **Enhanced Features:**
- ✅ Redis caching for faster responses
- ✅ Session management across conversations  
- ✅ General observability knowledge base
- ✅ Ollama integration (when available)

**Try asking:**
- "Show me recent Dynatrace problems"
- "How do I investigate slow requests?"
- "What's the best correlation strategy?"`,
      suggestions: [
        "Show me recent Dynatrace problems",
        "How to investigate performance issues",
        "What's the current system health?",
        "Help with troubleshooting methodology"
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

Please try:
- Rephrasing your question
- Checking your Dynatrace connection
- Using simpler queries

Need help? Try asking: "help"`;
  }
}
