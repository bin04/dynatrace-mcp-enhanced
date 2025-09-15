import { KnowledgeBase } from './knowledge-base.js';
import { OllamaClient } from './ollama-client.js';
import { DynatraceMCPBridge } from "./dynatrace-mcp-bridge.js";

export class ChatHandler {
  constructor({ redis, dynatraceConfig, ollamaConfig, mcpTools = null }) {
    this.redis = redis;
    this.dynatraceConfig = dynatraceConfig;
    this.ollamaConfig = ollamaConfig;
    
    // Initialize sub-components
    this.knowledgeBase = new KnowledgeBase();
    this.ollama = new OllamaClient(ollamaConfig);
    this.dynatraceMCP = new DynatraceMCPBridge(dynatraceConfig);  // <- This was missing!
    
    // Store reference to actual MCP tools
    this.mcpTools = mcpTools;
  }

  async handleMessage(message, sessionId) {
    try {
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

    // Dynatrace-specific queries - EXECUTE with API!
    if (msg.includes('dql') || msg.includes('fetch') || msg.includes('problems') || 
        msg.includes('vulnerabilities') || msg.includes('entities') || 
        msg.includes('logs') || msg.includes('metrics') || msg.includes('dynatrace')) {
      console.log(`🔍 DEBUG: -> dynatrace_query (execute with API)`);
      return 'dynatrace_query';
    }

    // General conversational queries (for Ollama)
    if (msg.includes('explain') || msg.includes('how do') || msg.includes('what is') ||
        msg.includes('help me') || msg.startsWith('can you')) {
      console.log(`🔍 DEBUG: -> ollama_chat`);
      return 'ollama_chat';
    }

    // General troubleshooting and observability questions
    if (msg.includes('troubleshoot') || msg.includes('investigate') || 
        msg.includes('correlate') || msg.includes('methodology')) {
      console.log(`🔍 DEBUG: -> knowledge_query`);
      return 'knowledge_query';
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

    try {
      console.log(`🔍 Executing REAL Dynatrace API query: ${message}`);
      
      // Step 1: Execute the actual Dynatrace API call
      const apiResult = await this.dynatraceMCP.executeQuery(message);
      
      // Step 2: Get Phi3 to analyze the results (only if we got real data)
      let combinedResponse;
      if (apiResult.realData) {
        try {
          const phi3Context = this.buildDynatraceAnalysisContext(message, apiResult);
          const phi3Analysis = await this.ollama.chat(
            `Analyze these Dynatrace results: ${message}`, 
            phi3Context
          );
          
          combinedResponse = {
            apiResults: apiResult,
            phi3Analysis: phi3Analysis,
            message: `${apiResult.message}\n\n---\n\n**🤖 AI Analysis:**\n${phi3Analysis.message}`,
            timestamp: new Date().toISOString()
          };
        } catch (phi3Error) {
          console.log(`🔄 Phi3 analysis failed, returning API results only`);
          combinedResponse = apiResult;
        }
      } else {
        // Just return the API result (might be auth error, etc.)
        combinedResponse = apiResult;
      }
      
      // Cache the result
      await this.redis.cacheDynatraceQuery(message, combinedResponse);

      return this.formatResponse(combinedResponse, 'dynatrace-working-api', sessionId);
      
    } catch (error) {
      console.error(`❌ Dynatrace API execution error:`, error);
      
      // Fallback to Phi3 explanation only
      console.log(`🔄 API failed, providing Phi3 explanation only`);
      return this.handleOllamaChat(message, sessionId);
    }
  }

  buildDynatraceAnalysisContext(message, apiResult) {
    return {
      currentTopic: 'dynatrace',
      expertiseArea: 'observability',
      apiData: apiResult,
      instructions: `You are analyzing real Dynatrace API results. The user asked: "${message}".

The API returned: ${JSON.stringify(apiResult, null, 2)}

Please provide:
- Analysis of what the results mean
- Any patterns or issues identified  
- Recommended next steps based on the data
- Additional queries that might be helpful

Keep the explanation practical and actionable.`
    };
  }

  async handleKnowledgeQuery(message, sessionId) {
    const knowledgeResponse = await this.knowledgeBase.query(message);
    return this.formatResponse(knowledgeResponse, 'knowledge', sessionId);
  }

  async handleOllamaChat(message, sessionId) {
    try {
      console.log(`🦙 Routing to Phi3 for general chat: ${message}`);
      const ollamaResponse = await this.ollama.chat(message);
      return this.formatResponse(ollamaResponse, 'phi3-general', sessionId);
    } catch (error) {
      console.log(`🔄 Phi3 unavailable (${error.message}), falling back to knowledge base`);
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

  generateHelpResponse(message) {
    return {
      message: `👋 **Enhanced Dynatrace MCP Assistant**

**🚀 NOW WITH REAL API INTEGRATION!**

🔍 **Dynatrace Queries** → Live API + AI Analysis
- "Are there any current problems?" → Real API call + Phi3 analysis
- "fetch dt.davis.problems" → Execute DQL + interpretation  
- "Show me error logs" → Live data + pattern analysis

💬 **General Questions** → Phi3 AI
- "Explain distributed systems"
- "How does Kubernetes work?"

📊 **Troubleshooting** → Knowledge Base
- "Investigation methodology"
- "Best practices"

**✨ What's Working:**
- 🎯 **Real API Calls** to ${this.dynatraceMCP?.environmentUrl || 'Dynatrace'}
- 🤖 **AI Analysis** of live results
- 📦 **Redis Caching** for performance

**Try these working queries:**
- "Are there any current problems?"
- "Show me recent vulnerabilities"  
- "What's the environment status?"`,
      suggestions: [
        "Are there any current problems?",
        "What's the environment status?",
        "Show me vulnerabilities",
        "Execute fetch dt.davis.problems"
      ]
    };
  }

  formatResponse(content, source, sessionId) {
    const timestamp = new Date().toISOString();
    let formatted = '';
    
    if (typeof content === 'string') {
      formatted = content;
    } else if (content && content.message) {
      formatted = content.message;
    } else {
      formatted = JSON.stringify(content, null, 2);
    }
    
    return `${formatted}\n\n_Source: ${source} | ${timestamp}_`;
  }

  formatErrorResponse(error) {
    return `❌ **Error occurred**: ${error.message}

**Available features:**
- 🎯 Dynatrace API integration
- 🤖 AI analysis and explanation  
- 📦 Redis caching for performance

**Try:**
- "Are there any problems?"
- "Explain microservices"
- "What's the environment status?"

Need help? Try asking: "help"`;
  }
}
