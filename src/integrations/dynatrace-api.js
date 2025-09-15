import axios from 'axios';

export class DynatraceAPI {
  constructor(config) {
    // Use the apps URL format like the official MCP
    this.environmentUrl = config.environment || "https://zjb50753.apps.dynatrace.com";
    this.oauthClientId = config.oauthClientId;
    this.oauthClientSecret = config.oauthClientSecret;
    this.platformToken = process.env.DT_PLATFORM_TOKEN; // Alternative auth method
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async authenticate() {
    try {
      console.log('🔐 Authenticating with Dynatrace OAuth (official MCP method)...');
      
      // Use the official SSO endpoint from Dynatrace MCP docs
      const tokenUrl = 'https://sso.dynatrace.com/sso/oauth2/token';
      
      const response = await axios.post(tokenUrl, 
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.oauthClientId,
          client_secret: this.oauthClientSecret,
          // Use the scopes from official Dynatrace MCP
          scope: 'app-engine:apps:run app-engine:functions:run storage:problems:read storage:logs:read storage:entities:read storage:events:read'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      console.log('✅ Successfully authenticated with Dynatrace SSO');
      console.log(`✅ Token expires in: ${response.data.expires_in} seconds`);
      console.log(`✅ Scope: ${response.data.scope}`);
      return true;
      
    } catch (error) {
      console.error('❌ Dynatrace OAuth failed:', error.response?.status, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        attempted: 'https://sso.dynatrace.com/sso/oauth2/token',
        credentials: `Client ID: ${this.oauthClientId ? 'PROVIDED' : 'MISSING'}`
      };
    }
  }

  async ensureAuthenticated() {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      return this.authenticate();
    }
    return true;
  }

  async executeQuery(message) {
    try {
      const queryType = this.detectQueryType(message);
      console.log(`🔍 Executing Dynatrace query: ${queryType}`);

      // Check if we have platform token as fallback
      if (this.platformToken) {
        console.log('🔑 Using Platform Token authentication');
        return this.executeWithPlatformToken(message, queryType);
      }

      // Try OAuth authentication
      const authResult = await this.ensureAuthenticated();
      if (authResult !== true) {
        return {
          type: 'auth_error',
          message: `🔐 **Authentication Status** (Following official Dynatrace MCP pattern)

**OAuth Endpoint:** https://sso.dynatrace.com/sso/oauth2/token
**Environment:** ${this.environmentUrl}
**Client ID:** ${this.oauthClientId ? 'Configured' : 'Missing'}

**Issue:** ${authResult.error}

**Alternative:** Add Platform Token to .env:
\`DT_PLATFORM_TOKEN=dt0s16.YOUR_TOKEN_HERE\`

**OAuth Troubleshooting:**
1. Verify client has these scopes: app-engine:apps:run, storage:problems:read
2. Check client permissions in Dynatrace
3. Ensure user has necessary environment permissions`,
          authResult: authResult,
          timestamp: new Date().toISOString()
        };
      }

      switch (queryType) {
        case 'problems':
          return this.getProblems();
        case 'environment':
          return this.getEnvironmentInfo();
        default:
          return this.getEnvironmentInfo();
      }
    } catch (error) {
      console.error('❌ Dynatrace API execution error:', error);
      throw error;
    }
  }

  async executeWithPlatformToken(message, queryType) {
    console.log('🔑 Using Platform Token for authentication');
    
    return {
      type: 'platform_token',
      message: `🔑 **Platform Token Authentication Ready**

**Environment:** ${this.environmentUrl}
**Token:** ${this.platformToken ? 'Configured' : 'Missing'}
**Query Type:** ${queryType}

**Status:** Platform token detected but query execution needs implementation.
This follows the official Dynatrace MCP v0.5.0+ pattern.`,
      timestamp: new Date().toISOString()
    };
  }

  async getProblems() {
    try {
      console.log('🚨 Fetching problems using OAuth Bearer token...');
      
      // Test the management API first (like in official docs)
      const managementUrl = `${this.environmentUrl}/platform/management/v1/environment`;
      console.log(`📞 Testing connection: ${managementUrl}`);
      
      const testResponse = await axios.get(managementUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      console.log(`✅ Environment test successful: ${testResponse.data.environmentId}`);

      // Now try the problems API
      const problemsUrl = `${this.environmentUrl}/api/v2/problems`;
      const response = await axios.get(problemsUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          from: 'now-24h',
          to: 'now',
          pageSize: 10
        },
        timeout: 30000
      });

      const problems = response.data.problems || [];
      
      let message = `🚨 **REAL Dynatrace Problems** (${problems.length} found)\n\n`;
      
      if (problems.length === 0) {
        message += '✅ **No current problems!** Your environment is healthy.\n\n';
      } else {
        problems.forEach((problem, index) => {
          message += `**Problem ${index + 1}: ${problem.problemId}**\n`;
          message += `- **Title:** ${problem.title}\n`;
          message += `- **Status:** ${problem.status}\n`;
          message += `- **Severity:** ${problem.severityLevel}\n`;
          message += `- **Started:** ${new Date(problem.startTime).toLocaleString()}\n\n`;
        });
      }

      message += `**Environment:** ${testResponse.data.environmentId}\n`;
      message += `**Authentication:** OAuth Bearer Token ✅`;

      return {
        type: 'problems',
        message: message,
        realData: true,
        problemCount: problems.length,
        problems: problems,
        environmentId: testResponse.data.environmentId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Problems API failed:', error.response?.status, error.response?.data);
      
      return {
        type: 'problems_error',
        message: `❌ **API Call Failed** (Following official MCP pattern)

**Management API:** ${this.environmentUrl}/platform/management/v1/environment
**Problems API:** ${this.environmentUrl}/api/v2/problems
**Status:** ${error.response?.status || 'Network Error'}
**Error:** ${error.response?.data?.error?.message || error.message}

**This suggests:** OAuth authentication succeeded but API access needs adjustment.
Check that your OAuth client has the required scopes in Dynatrace.`,
        error: error.response?.data || error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  detectQueryType(message) {
    const msg = message.toLowerCase();
    
    if (msg.includes('problems') || msg.includes('issues')) {
      return 'problems';
    } else if (msg.includes('environment') || msg.includes('info')) {
      return 'environment';
    } else {
      return 'problems';
    }
  }

  async getEnvironmentInfo() {
    try {
      const managementUrl = `${this.environmentUrl}/platform/management/v1/environment`;
      const response = await axios.get(managementUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      return {
        type: 'environment',
        message: `🏢 **Dynatrace Environment Info**

**Environment ID:** ${response.data.environmentId}
**URL:** ${this.environmentUrl}
**State:** ${response.data.state}
**Created:** ${new Date(response.data.createTime).toLocaleDateString()}

**Authentication:** OAuth Bearer Token ✅
**Status:** Connected to official Dynatrace APIs`,
        realData: true,
        environmentData: response.data,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Environment API failed:', error);
      throw error;
    }
  }
}
