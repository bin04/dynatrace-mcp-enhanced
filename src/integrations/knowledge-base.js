export class KnowledgeBase {
  constructor() {
    // Generic knowledge patterns - no proprietary content
    this.generalPatterns = this.loadGeneralPatterns();
  }

  loadGeneralPatterns() {
    return {
      dynatrace: {
        commonQueries: [
          "fetch dt.davis.problems",
          "fetch dt.security_problems", 
          "fetch logs",
          "fetch dt.entity.service"
        ],
        investigationTips: [
          "Use correlation.id for tracking requests across services",
          "Check both problems and events for complete picture",
          "Look at dependencies when investigating service issues",
          "Monitor both infrastructure and application metrics"
        ]
      },
      troubleshooting: {
        methodology: [
          "Identify the scope of the issue",
          "Check recent changes or deployments",
          "Look for correlated events across systems",
          "Verify dependencies and downstream impacts"
        ]
      }
    };
  }

  async query(message) {
    const msg = message.toLowerCase();
    
    // Generic troubleshooting guidance
    if (msg.includes("problem") || msg.includes("issue") || msg.includes("failure")) {
      return this.getTroubleshootingGuidance();
    }

    // Dynatrace help
    if (msg.includes("dql") || msg.includes("dynatrace") || msg.includes("query")) {
      return this.getDynatraceGuidance();
    }

    return this.getGeneralHelp();
  }

  getTroubleshootingGuidance() {
    return {
      message: `🔍 **General Troubleshooting Methodology**

**📋 Investigation Steps:**
1. **Scope the Issue** - Identify affected services/users
2. **Timeline Analysis** - When did it start? Any recent changes?
3. **Correlation** - Look for related events or alerts
4. **Dependencies** - Check upstream/downstream services
5. **Metrics** - Analyze performance and error patterns

**🔗 Correlation Strategies:**
- Use trace IDs and correlation IDs
- Look for timing patterns across systems
- Check both infrastructure and application layers

**📊 Key Dynatrace Queries:**
- \`fetch dt.davis.problems\` - Recent issues
- \`fetch logs | filter ...\` - Application logs
- \`fetch dt.entity.service\` - Service health`
    };
  }

  getDynatraceGuidance() {
    return {
      message: `📊 **Dynatrace Query Guidance**

**🔍 Common DQL Patterns:**
\`\`\`
fetch dt.davis.problems | limit 10
fetch logs | filter timestamp >= now() - 1h
fetch dt.security_problems | filter risk.level == "CRITICAL"
fetch dt.entity.service | filter health_state == "UNHEALTHY"
\`\`\`

**💡 Investigation Tips:**
- Start with problems and events for context
- Use time filters to focus on relevant timeframe
- Leverage built-in fields for filtering
- Combine multiple data sources for complete picture

**🔗 Useful Fields:**
- \`correlation.id\` - Track requests across services
- \`timestamp\` - Time-based filtering
- \`entity.name\` - Service identification
- \`event.kind\` - Event classification`
    };
  }

  getGeneralHelp() {
    return {
      message: `🤖 **Enhanced Dynatrace Assistant**

I can help with:

🔍 **Dynatrace Queries**
- "Show me recent problems"
- "fetch logs from last hour"
- "list critical vulnerabilities"

📊 **General Troubleshooting**
- "How to investigate performance issues"
- "Troubleshooting methodology"
- "Correlation strategies"

💬 **General Questions**
- Ask about observability concepts
- Get help with DQL queries
- Learn about best practices

**Try asking:**
- "Show recent Dynatrace problems"
- "How do I investigate slow requests?"
- "What's the best way to correlate events?"`
    };
  }
}
