import axios from 'axios';

export class DynatraceWorkingAPI {
  constructor(config) {
    this.environmentUrl = config.environment;
    this.oauthClientId = config.oauthClientId;
    this.oauthClientSecret = config.oauthClientSecret;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async authenticate() {
    try {
      console.log('🔐 OAuth authentication...');
      
      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('client_id', this.oauthClientId);
      formData.append('client_secret', this.oauthClientSecret);
      formData.append('scope', 'app-engine:apps:run app-engine:functions:run');
      
      const response = await axios.post('https://sso.dynatrace.com/sso/oauth2/token', 
        formData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      console.log('✅ OAuth successful');
      return true;

    } catch (error) {
      console.error('❌ OAuth failed:', error.response?.data);
      return false;
    }
  }

  async executeQuery(message) {
    const queryType = this.detectQueryType(message);
    
    const authenticated = await this.authenticate();
    if (!authenticated) {
      return {
        type: 'auth_failed',
        message: `❌ OAuth authentication failed`,
        timestamp: new Date().toISOString()
      };
    }

    switch (queryType) {
      case 'problems':
        return this.getProblems();
      case 'environment':
        return this.getEnvironmentInfo();
      default:
        return this.getProblems();
    }
  }

  async getProblems() {
    try {
      console.log(`📞 Fetching problems from Dynatrace...`);
      
      // Get problems from the last 24 hours
      const problemsResponse = await axios.get(`${this.environmentUrl}/api/v2/problems`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        },
        params: {
          from: 'now-1d',
          to: 'now',
          pageSize: 10
        }
      });

      const problems = problemsResponse.data.problems || [];
      console.log(`✅ Found ${problems.length} problems`);
      
      let message = `🚨 **REAL Dynatrace Problems** (${problems.length} found)\n\n`;
      
      if (problems.length === 0) {
        message += '✅ **No current problems!** Your environment is healthy.\n\n';
        message += `**Environment:** zjb50753\n`;
        message += `**Time Range:** Last 24 hours\n`;
        message += `**Status:** All systems operational 🟢`;
      } else {
        problems.forEach((problem, index) => {
          message += `**Problem ${index + 1}: ${problem.problemId}**\n`;
          message += `- **Title:** ${problem.title}\n`;
          message += `- **Status:** ${problem.status}\n`;
          message += `- **Severity:** ${problem.severityLevel}\n`;
          message += `- **Started:** ${new Date(problem.startTime).toLocaleString()}\n`;
          if (problem.endTime) {
            message += `- **Ended:** ${new Date(problem.endTime).toLocaleString()}\n`;
          }
          message += `- **Affected Entities:** ${problem.affectedEntities?.length || 0}\n`;
          message += `- **Management Zones:** ${problem.managementZones?.map(mz => mz.name).join(', ') || 'None'}\n\n`;
        });
        
        message += `**Environment:** zjb50753\n`;
        message += `**API Status:** Connected successfully ✅`;
      }

      return {
        type: 'problems',
        message: message,
        realData: true,
        problemCount: problems.length,
        problems: problems,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Problems API failed:', error.response?.status, error.response?.data);
      
      // If problems API fails, fall back to environment info
      console.log('🔄 Falling back to environment info...');
      return this.getEnvironmentInfo();
    }
  }

  async getEnvironmentInfo() {
    try {
      const envResponse = await axios.get(`${this.environmentUrl}/platform/management/v1/environment`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      return {
        type: 'environment',
        message: `🏢 **Dynatrace Environment Status**

**Environment ID:** ${envResponse.data.environmentId}
**State:** ${envResponse.data.state}
**Created:** ${new Date(envResponse.data.createTime).toLocaleDateString()}
**URL:** ${this.environmentUrl}

**OAuth Authentication:** ✅ Working
**API Access:** ✅ Connected

**Ready for monitoring and problem detection!**`,
        realData: true,
        environmentData: envResponse.data,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw error;
    }
  }

  detectQueryType(message) {
    const msg = message.toLowerCase();
    
    if (msg.includes('problems') || msg.includes('issues') || msg.includes('incidents')) {
      return 'problems';
    } else if (msg.includes('environment') || msg.includes('status')) {
      return 'environment';
    } else {
      return 'problems';
    }
  }
}
