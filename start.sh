#!/bin/bash

echo "🚀 Starting Dynatrace MCP Enhanced..."

# Check if Redis is running
if ! pgrep -x "redis-server" > /dev/null; then
    echo "⚠️ Redis not running, starting..."
    redis-server --daemonize yes
fi

# Check environment file
if [ ! -f .env ]; then
    echo "⚠️ .env file not found, copying from .env.example"
    cp .env.example .env
    echo "📝 Please edit .env with your configuration"
fi

# Start the enhanced server
npm start
