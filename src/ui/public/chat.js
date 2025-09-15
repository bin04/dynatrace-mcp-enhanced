class ChatInterface {
  constructor() {
    this.messagesDiv = document.getElementById('messages');
    this.messageInput = document.getElementById('messageInput');
    this.sendButton = document.getElementById('sendButton');
    this.buttonText = document.getElementById('buttonText');
    this.loadingSpinner = document.getElementById('loadingSpinner');
    this.statusIndicator = document.getElementById('statusIndicator');
    this.statusText = document.getElementById('statusText');
    this.connectionStatus = document.getElementById('connectionStatus');

    this.isLoading = false;
    this.sessionId = this.generateSessionId();

    this.init();
  }

  generateSessionId() {
    return 'web-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  init() {
    // Event listeners
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Test connection on load
    this.checkConnection();

    // Focus input
    this.messageInput.focus();

    // Periodic connection check
    setInterval(() => this.checkConnection(), 30000);
  }

  async checkConnection() {
    try {
      this.updateStatus('checking', 'Checking connection...');

      const response = await fetch('/health');

      if (response.ok) {
        const data = await response.json();
        this.updateStatus('connected', `Connected to ${data.service}`);
      } else {
        this.updateStatus('disconnected', `Service error: ${response.status}`);
      }
    } catch (error) {
      this.updateStatus('disconnected', 'Connection failed');
      console.error('Connection check failed:', error);
    }
  }

  updateStatus(status, text) {
    this.connectionStatus.className = `status ${status}`;
    this.statusText.textContent = text;
  }

  addMessage(content, type, timestamp = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;

    if (type === 'assistant' && content.includes('```')) {
      messageDiv.innerHTML = this.formatMessage(content);
    } else {
      messageDiv.textContent = content;
    }

    // Add timestamp for debugging if provided
    if (timestamp && type !== 'system') {
      const timeSpan = document.createElement('small');
      timeSpan.style.opacity = '0.6';
      timeSpan.style.fontSize = '12px';
      timeSpan.style.display = 'block';
      timeSpan.style.marginTop = '4px';
      timeSpan.textContent = new Date(timestamp).toLocaleTimeString();
      messageDiv.appendChild(timeSpan);
    }

    this.messagesDiv.appendChild(messageDiv);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
  }

  formatMessage(content) {
    return content
      .replace(/```(\w+)?\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  setLoading(loading) {
    this.isLoading = loading;
    this.sendButton.disabled = loading;

    if (loading) {
      this.buttonText.style.display = 'none';
      this.loadingSpinner.style.display = 'inline';
    } else {
      this.buttonText.style.display = 'inline';
      this.loadingSpinner.style.display = 'none';
    }
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();

    if (!message || this.isLoading) return;

    // Add user message
    this.addMessage(message, 'user');
    this.messageInput.value = '';

    // Show loading state
    this.setLoading(true);

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant-message';
    loadingDiv.innerHTML = '<em>🤔 Thinking...</em>';
    this.messagesDiv.appendChild(loadingDiv);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;

    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          session_id: this.sessionId,
        }),
      });

      // Remove loading message
      this.messagesDiv.removeChild(loadingDiv);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      this.addMessage(data.response || 'No response received', 'assistant', data.timestamp);
    } catch (error) {
      // Remove loading message
      if (this.messagesDiv.contains(loadingDiv)) {
        this.messagesDiv.removeChild(loadingDiv);
      }

      this.addMessage(`❌ Error: ${error.message}`, 'system');
      console.error('Chat error:', error);

      // Update connection status
      this.updateStatus('disconnected', 'Service unavailable');
    } finally {
      this.setLoading(false);
      this.messageInput.focus();
    }
  }
}

// Initialize chat interface when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.chatInterface = new ChatInterface();
});

// Make sendMessage available globally for the button onclick
function sendMessage() {
  if (window.chatInterface) {
    window.chatInterface.sendMessage();
  }
}
